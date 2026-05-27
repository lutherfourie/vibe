// A small CSP experiment: a colony of gophers passing a rumor around.
// Each gopher is a goroutine. Each gopher owns an inbox channel (its burrow).
// Communication is the only shared state. "Intelligence" — drift, agreement,
// folklore — emerges from local interactions over time.
package main

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"sync"
	"time"
)

type Personality int

const (
	Faithful    Personality = iota // repeats what they heard
	Embellisher                    // adds confidence words
	Mistaker                       // swaps a word here and there
	Skeptic                        // hedges everything
)

var personalityNames = []string{"faithful", "embellisher", "mistaker", "skeptic"}

type Rumor struct {
	From    string
	Content string
}

type Gopher struct {
	Name        string
	Personality Personality
	Inbox       chan Rumor
	Knows       string // only written by this gopher's own goroutine
}

func (g *Gopher) live(peers []*Gopher, town chan<- string, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	// each gopher chats on its own rhythm
	tick := time.Duration(300+rand.IntN(500)) * time.Millisecond
	ticker := time.NewTicker(tick)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return

		case rumor := <-g.Inbox:
			old := g.Knows
			g.Knows = g.mutate(rumor.Content)
			switch {
			case old == "":
				town <- fmt.Sprintf("%-7s learns from %-7s -> %q", g.Name, rumor.From, g.Knows)
			case old != g.Knows:
				town <- fmt.Sprintf("%-7s reshapes via %-7s : %q -> %q", g.Name, rumor.From, old, g.Knows)
			}

		case <-ticker.C:
			if g.Knows == "" {
				continue // nothing to say yet
			}
			partner := peers[rand.IntN(len(peers))]
			if partner.Name == g.Name {
				continue
			}
			// non-blocking send: if their burrow is full, try again later
			select {
			case partner.Inbox <- Rumor{From: g.Name, Content: g.Knows}:
			default:
			}
		}
	}
}

func (g *Gopher) mutate(s string) string {
	switch g.Personality {
	case Faithful:
		return s

	case Embellisher:
		adjs := []string{"definitely", "obviously", "totally", "supposedly"}
		for _, a := range adjs {
			if strings.HasPrefix(s, a+" ") {
				return s
			}
		}
		return adjs[rand.IntN(len(adjs))] + " " + s

	case Mistaker:
		words := strings.Fields(s)
		swaps := map[string]string{
			"farmer": "rancher", "plants": "harvests", "corn": "wheat",
			"Tuesday": "Friday", "the": "a", "on": "by",
		}
		for i, w := range words {
			if alt, ok := swaps[w]; ok && rand.Float64() < 0.35 {
				words[i] = alt
				break
			}
		}
		return strings.Join(words, " ")

	case Skeptic:
		if strings.HasPrefix(s, "allegedly ") {
			return s
		}
		return "allegedly " + s
	}
	return s
}

func main() {
	roster := []struct {
		name string
		p    Personality
	}{
		{"Acorn", Faithful},
		{"Burrow", Embellisher},
		{"Clover", Skeptic},
		{"Digger", Mistaker},
		{"Echo", Embellisher},
		{"Fennel", Faithful},
	}

	gophers := make([]*Gopher, len(roster))
	for i, r := range roster {
		gophers[i] = &Gopher{
			Name:        r.name,
			Personality: r.p,
			Inbox:       make(chan Rumor, 4),
		}
	}

	// patient zero
	seed := "the farmer plants corn on Tuesday"
	gophers[0].Knows = seed

	fmt.Printf("Day breaks over the meadow. %s mutters: %q\n\n", gophers[0].Name, seed)

	town := make(chan string, 128)
	done := make(chan struct{})
	var wg sync.WaitGroup

	for _, g := range gophers {
		wg.Add(1)
		go g.live(gophers, town, done, &wg)
	}

	// town crier: fans events in from all gophers and prints them in order
	var crierWg sync.WaitGroup
	crierWg.Add(1)
	go func() {
		defer crierWg.Done()
		for msg := range town {
			fmt.Println("  ~", msg)
		}
	}()

	// let them chatter
	time.Sleep(4 * time.Second)
	close(done)
	wg.Wait()
	close(town)
	crierWg.Wait()

	fmt.Println("\nDusk. The gophers retire to their burrows believing:")
	for _, g := range gophers {
		belief := g.Knows
		if belief == "" {
			belief = "(never heard a thing)"
		}
		fmt.Printf("  %-7s (%-11s): %s\n", g.Name, personalityNames[g.Personality], belief)
	}
}
