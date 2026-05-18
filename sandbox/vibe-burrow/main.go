// Vibe Burrow v2 — real software-world signals + personality.
//
// Real sources:
//   fsnotify  -> FileTouched events
//   git log   -> GitCommit events (poll every 5s)
//   pnpm wrap -> BuildStarted / BuildPassed / BuildFailed (with -build flag)
//   surfaces  -> SurfaceUp / SurfaceDown (claude, codex, cerebras every 8s)
//
// Each gopher has a voice. They chatter on their own tick, react in character
// to events the Scout routes them, and answer when the Mayor polls. No
// shared memory — only channels.
package main

import (
	"context"
	"flag"
	"fmt"
	"math/rand/v2"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// ============ flags ============

var (
	watchDir = flag.String("watch", ".", "directory to watch with fsnotify")
	runBuild = flag.Bool("build", false, "run `pnpm run check` once at startup")
	duration = flag.Duration("duration", 15*time.Second, "how long to run the burrow")
)

// ============ events ============

type EventKind int

const (
	FileTouched EventKind = iota
	GitCommit
	BuildStarted
	BuildPassed
	BuildFailed
	SurfaceUp
	SurfaceDown
)

var eventName = map[EventKind]string{
	FileTouched:  "file-touched",
	GitCommit:    "git-commit",
	BuildStarted: "build-started",
	BuildPassed:  "build-passed",
	BuildFailed:  "build-failed",
	SurfaceUp:    "surface-up",
	SurfaceDown:  "surface-down",
}

type Event struct {
	Kind    EventKind
	Payload string
	Detail  string
}

// ============ gopher type ============

type Status struct {
	Name string
	Mood string
	Data string
}

type Gopher struct {
	Name    string
	Voice   string
	Inbox   chan Event
	Polls   chan chan Status
	state   map[string]int
	onEvent func(g *Gopher, e Event, say func(string))
	onTick  func(g *Gopher, say func(string))
	mood    func(g *Gopher) string
}

func (g *Gopher) live(logCh chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	if g.state == nil {
		g.state = map[string]int{}
	}
	say := func(s string) {
		select {
		case logCh <- fmt.Sprintf("    %-11s | %s", g.Name, s):
		case <-done:
		}
	}
	// each gopher chatters on its own rhythm
	tick := time.NewTicker(time.Duration(2500+rand.IntN(2500)) * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-done:
			return
		case e := <-g.Inbox:
			if g.onEvent != nil {
				g.onEvent(g, e, say)
			}
		case reply := <-g.Polls:
			reply <- Status{Name: g.Name, Mood: g.mood(g), Data: g.summary()}
		case <-tick.C:
			if g.onTick != nil {
				g.onTick(g, say)
			}
		}
	}
}

func (g *Gopher) summary() string {
	if len(g.state) == 0 {
		return "(quiet)"
	}
	parts := make([]string, 0, len(g.state))
	for k, v := range g.state {
		parts = append(parts, fmt.Sprintf("%s=%d", k, v))
	}
	sort.Strings(parts)
	return strings.Join(parts, " ")
}

// ============ specialists ============

func newSentinel() *Gopher {
	worries := []string{
		"I don't like the look of this.",
		"Did anyone else feel that?",
		"All's well. Probably. For now.",
		"I'm watching. Always watching.",
	}
	return &Gopher{
		Name:  "Sentinel",
		Voice: "paranoid worrier",
		Inbox: make(chan Event, 32),
		Polls: make(chan chan Status, 1),
		onEvent: func(g *Gopher, e Event, say func(string)) {
			switch e.Kind {
			case BuildFailed:
				g.state["alarms"]++
				if g.state["alert"] < 10 {
					g.state["alert"] += 3
				}
				say(fmt.Sprintf("Build failed! I KNEW it. alert=%d", g.state["alert"]))
			case BuildPassed:
				if g.state["alert"] > 0 {
					g.state["alert"]--
				}
				say(fmt.Sprintf("Build green. Suspicious. alert=%d", g.state["alert"]))
			case SurfaceDown:
				if g.state["alert"] < 10 {
					g.state["alert"] += 2
				}
				say(fmt.Sprintf("%s went dark. alert=%d", e.Payload, g.state["alert"]))
			case SurfaceUp:
				if g.state["alarms"] > 0 {
					say(fmt.Sprintf("%s back online. Watching it close.", e.Payload))
				}
			}
		},
		onTick: func(g *Gopher, say func(string)) {
			if g.state["alert"] > 0 {
				g.state["alert"]--
			}
			if rand.IntN(4) == 0 {
				say(worries[rand.IntN(len(worries))])
			}
		},
		mood: func(g *Gopher) string {
			switch a := g.state["alert"]; {
			case a >= 7:
				return "panicking"
			case a >= 4:
				return "anxious"
			case a >= 1:
				return "wary"
			default:
				return "calm-ish"
			}
		},
	}
}

func newWatcher() *Gopher {
	musings := []string{
		"Show me the changes.",
		"Files. I love files.",
		"Files come and files go.",
		"Anyone editing anything?",
	}
	return &Gopher{
		Name:  "Watcher",
		Voice: "curious gossip",
		Inbox: make(chan Event, 64),
		Polls: make(chan chan Status, 1),
		onEvent: func(g *Gopher, e Event, say func(string)) {
			if e.Kind != FileTouched {
				return
			}
			key := filepath.Base(e.Payload)
			g.state[key]++
			c := g.state[key]
			switch c {
			case 1:
				say(fmt.Sprintf("First touch on %s. Interesting.", key))
			case 3:
				say(fmt.Sprintf("Ooh — %s is heating up.", key))
			case 5:
				say(fmt.Sprintf("Someone is *wrestling* with %s.", key))
			}
		},
		onTick: func(g *Gopher, say func(string)) {
			if len(g.state) == 0 && rand.IntN(3) == 0 {
				say(musings[rand.IntN(len(musings))])
			}
		},
		mood: func(g *Gopher) string {
			hot := []string{}
			for f, c := range g.state {
				if c >= 3 {
					hot = append(hot, f)
				}
			}
			if len(hot) == 0 {
				return "browsing"
			}
			sort.Strings(hot)
			if len(hot) > 3 {
				return fmt.Sprintf("%d hot files", len(hot))
			}
			return "hot:" + strings.Join(hot, ",")
		},
	}
}

func newChronicler() *Gopher {
	return &Gopher{
		Name:  "Chronicler",
		Voice: "dispassionate archivist",
		Inbox: make(chan Event, 32),
		Polls: make(chan chan Status, 1),
		onEvent: func(g *Gopher, e Event, say func(string)) {
			switch e.Kind {
			case GitCommit:
				g.state["commits"]++
				say(fmt.Sprintf("Recorded commit %s.", e.Payload))
			case BuildPassed:
				g.state["builds_ok"]++
			case BuildFailed:
				g.state["builds_fail"]++
			case SurfaceUp:
				g.state["surface_ups"]++
			case SurfaceDown:
				g.state["surface_downs"]++
			}
		},
		onTick: func(g *Gopher, say func(string)) {
			if rand.IntN(8) == 0 {
				say("Filed. Always filed.")
			}
		},
		mood: func(g *Gopher) string {
			total := 0
			for _, v := range g.state {
				total += v
			}
			if total == 0 {
				return "page blank"
			}
			return fmt.Sprintf("scribbling (%d)", total)
		},
	}
}

func newPostmaster() *Gopher {
	return &Gopher{
		Name:  "Postmaster",
		Voice: "fretful mail carrier",
		Inbox: make(chan Event, 32),
		Polls: make(chan chan Status, 1),
		onEvent: func(g *Gopher, e Event, say func(string)) {
			switch e.Kind {
			case SurfaceUp:
				prev := g.state["down_"+e.Payload]
				g.state["up_"+e.Payload]++
				if prev > 0 {
					say(fmt.Sprintf("%s answered! Letters resuming.", e.Payload))
				} else {
					say(fmt.Sprintf("%s present and answering.", e.Payload))
				}
			case SurfaceDown:
				g.state["down_"+e.Payload]++
				say(fmt.Sprintf("%s isn't picking up. Return to sender.", e.Payload))
			}
		},
		onTick: func(g *Gopher, say func(string)) {
			if rand.IntN(6) == 0 {
				say("Checking the mail bags...")
			}
		},
		mood: func(g *Gopher) string {
			ups, downs := 0, 0
			for k, v := range g.state {
				if strings.HasPrefix(k, "up_") {
					ups += v
				} else if strings.HasPrefix(k, "down_") {
					downs += v
				}
			}
			switch {
			case ups > 0 && downs == 0:
				return "mail running"
			case ups > 0 && downs > 0:
				return "partial delivery"
			case downs > 0:
				return "no answer"
			default:
				return "expecting mail"
			}
		},
	}
}

// ============ Scout: fan-out router ============

func scout(in <-chan Event, gophers []*Gopher, logCh chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	byName := map[string]*Gopher{}
	for _, g := range gophers {
		byName[g.Name] = g
	}
	route := func(name string, e Event) {
		g := byName[name]
		if g == nil {
			return
		}
		select {
		case g.Inbox <- e:
		default:
			logCh <- fmt.Sprintf("  ! %s's burrow full — dropped %s", g.Name, eventName[e.Kind])
		}
	}
	for {
		select {
		case <-done:
			return
		case e, ok := <-in:
			if !ok {
				return
			}
			logCh <- fmt.Sprintf("  > Scout: %-13s %s %s", eventName[e.Kind], e.Payload, dim(e.Detail))
			switch e.Kind {
			case FileTouched:
				route("Watcher", e)
			case GitCommit:
				route("Chronicler", e)
			case BuildStarted, BuildPassed, BuildFailed:
				route("Sentinel", e)
				route("Chronicler", e)
			case SurfaceUp, SurfaceDown:
				route("Sentinel", e)
				route("Chronicler", e)
				route("Postmaster", e)
			}
		}
	}
}

func dim(s string) string {
	if s == "" {
		return ""
	}
	if len(s) > 60 {
		s = s[:57] + "..."
	}
	return "(" + s + ")"
}

// ============ Mayor ============

func mayor(gophers []*Gopher, logCh chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	ticker := time.NewTicker(4 * time.Second)
	defer ticker.Stop()
	round := 0
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			round++
			logCh <- fmt.Sprintf("\n  === Mayor round %d ===", round)
			for _, g := range gophers {
				reply := make(chan Status, 1)
				select {
				case g.Polls <- reply:
					select {
					case s := <-reply:
						logCh <- fmt.Sprintf("    %-11s [%-18s] %s", s.Name, s.Mood, s.Data)
					case <-time.After(500 * time.Millisecond):
						logCh <- fmt.Sprintf("    %-11s (silent)", g.Name)
					}
				case <-done:
					return
				case <-time.After(200 * time.Millisecond):
					logCh <- fmt.Sprintf("    %-11s (mailbox full)", g.Name)
				}
			}
		}
	}
}

// ============ World sources: REAL signals ============

// fsnotifyWorld emits FileTouched on writes/creates in dir (non-recursive).
func fsnotifyWorld(dir string, out chan<- Event, logCh chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	w, err := fsnotify.NewWatcher()
	if err != nil {
		logCh <- fmt.Sprintf("  ! fsnotify failed to init: %v", err)
		return
	}
	defer w.Close()

	abs, _ := filepath.Abs(dir)
	if err := w.Add(abs); err != nil {
		logCh <- fmt.Sprintf("  ! fsnotify cannot watch %s: %v", abs, err)
		return
	}
	logCh <- fmt.Sprintf("  . fsnotify watching %s", abs)

	for {
		select {
		case <-done:
			return
		case ev, ok := <-w.Events:
			if !ok {
				return
			}
			if ev.Op&(fsnotify.Write|fsnotify.Create) == 0 {
				continue
			}
			select {
			case out <- Event{Kind: FileTouched, Payload: ev.Name, Detail: ev.Op.String()}:
			case <-done:
				return
			}
		case err, ok := <-w.Errors:
			if !ok {
				return
			}
			logCh <- fmt.Sprintf("  ! fsnotify error: %v", err)
		}
	}
}

// gitPollingWorld polls `git log -1` and emits when the HEAD sha changes.
func gitPollingWorld(out chan<- Event, logCh chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	lastSHA := ""
	first := true
	check := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		o, err := exec.CommandContext(ctx, "git", "log", "-1", "--format=%h %s").Output()
		if err != nil {
			return
		}
		line := strings.TrimSpace(string(o))
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 0 {
			return
		}
		sha := parts[0]
		if sha == lastSHA {
			return
		}
		if !first {
			msg := ""
			if len(parts) > 1 {
				msg = parts[1]
			}
			select {
			case out <- Event{Kind: GitCommit, Payload: sha, Detail: msg}:
			case <-done:
			}
		}
		lastSHA = sha
		first = false
	}

	check() // prime so we don't fire on first poll
	logCh <- fmt.Sprintf("  . git polling started (HEAD %s)", lastSHA)

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			check()
		}
	}
}

// surfaceHealthWorld pings the LLM surfaces and emits state-change events.
func surfaceHealthWorld(out chan<- Event, logCh chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	type checker struct {
		name string
		fn   func() bool
	}
	cmdCheck := func(args ...string) func() bool {
		return func() bool {
			ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
			defer cancel()
			return exec.CommandContext(ctx, args[0], args[1:]...).Run() == nil
		}
	}
	envCheck := func(key string) func() bool {
		return func() bool { return os.Getenv(key) != "" }
	}

	checkers := []checker{
		{"claude", cmdCheck("claude", "--version")},
		{"codex", cmdCheck("codex", "--version")},
		{"cerebras", envCheck("CEREBRAS_API_KEY")},
	}

	state := map[string]bool{}
	known := map[string]bool{}

	probe := func() {
		for _, c := range checkers {
			up := c.fn()
			prev, knew := state[c.name], known[c.name]
			state[c.name] = up
			known[c.name] = true
			if !knew || prev != up {
				kind := SurfaceUp
				if !up {
					kind = SurfaceDown
				}
				select {
				case out <- Event{Kind: kind, Payload: c.name}:
				case <-done:
					return
				}
			}
		}
	}

	probe() // initial
	ticker := time.NewTicker(8 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			probe()
		}
	}
}

// runOneBuild runs `pnpm run check` once and emits Build* events.
func runOneBuild(out chan<- Event, logCh chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	select {
	case out <- Event{Kind: BuildStarted, Payload: "pnpm run check"}:
	case <-done:
		return
	}
	logCh <- "  . build runner: pnpm run check ..."

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "pnpm", "run", "check")
	err := cmd.Run()

	ev := Event{Kind: BuildPassed, Payload: "pnpm run check"}
	if err != nil {
		ev = Event{Kind: BuildFailed, Payload: "pnpm run check", Detail: err.Error()}
	}
	select {
	case out <- ev:
	case <-done:
	}
}

// ============ wiring ============

func main() {
	flag.Parse()

	gophers := []*Gopher{
		newSentinel(),
		newWatcher(),
		newChronicler(),
		newPostmaster(),
	}

	worldOut := make(chan Event, 64)
	logCh := make(chan string, 1024)
	done := make(chan struct{})
	var wg sync.WaitGroup

	// town crier — serializes everyone's output so transcript stays ordered
	var crierWg sync.WaitGroup
	crierWg.Add(1)
	go func() {
		defer crierWg.Done()
		for m := range logCh {
			fmt.Println(m)
		}
	}()

	for _, g := range gophers {
		wg.Add(1)
		go g.live(logCh, done, &wg)
	}
	wg.Add(4)
	go scout(worldOut, gophers, logCh, done, &wg)
	go mayor(gophers, logCh, done, &wg)
	go fsnotifyWorld(*watchDir, worldOut, logCh, done, &wg)
	go gitPollingWorld(worldOut, logCh, done, &wg)

	wg.Add(1)
	go surfaceHealthWorld(worldOut, logCh, done, &wg)

	if *runBuild {
		wg.Add(1)
		go runOneBuild(worldOut, logCh, done, &wg)
	}

	fmt.Printf("Vibe Burrow online. Watching %q for %s.\n", *watchDir, *duration)
	fmt.Println("The colony:")
	for _, g := range gophers {
		fmt.Printf("  %-11s — %s\n", g.Name, g.Voice)
	}
	fmt.Println()

	time.Sleep(*duration)
	close(done)
	wg.Wait()
	close(logCh)
	crierWg.Wait()

	fmt.Println("\nDusk. Final private state:")
	for _, g := range gophers {
		fmt.Printf("  %-11s %s\n", g.Name, g.summary())
	}
}
