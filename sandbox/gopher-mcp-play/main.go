package main

import (
    "context"
    "fmt"
    "math/rand"
    "sync"
    "time"
)

type MCPMessage struct {
    From    string
    To      string
    Kind    string
    Topic   string
    Payload string
}

type Bus struct {
    in      chan MCPMessage
    inboxes map[string]chan MCPMessage
    mu      sync.RWMutex
}

func NewBus(buffer int) *Bus {
    return &Bus{
        in:      make(chan MCPMessage, buffer),
        inboxes: make(map[string]chan MCPMessage),
    }
}

func (b *Bus) Register(name string, buffer int) <-chan MCPMessage {
    inbox := make(chan MCPMessage, buffer)
    b.mu.Lock()
    b.inboxes[name] = inbox
    b.mu.Unlock()
    return inbox
}

func (b *Bus) Send(ctx context.Context, msg MCPMessage) bool {
    select {
    case <-ctx.Done():
        return false
    case b.in <- msg:
        return true
    }
}

func (b *Bus) Start(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        case msg := <-b.in:
            b.mu.RLock()
            if msg.To == "" {
                for name, inbox := range b.inboxes {
                    if name == msg.From {
                        continue
                    }
                    b.trySend(msg, inbox)
                }
            } else if target, ok := b.inboxes[msg.To]; ok {
                b.trySend(msg, target)
            }
            b.mu.RUnlock()
        }
    }
}

func (b *Bus) trySend(msg MCPMessage, inbox chan MCPMessage) {
    select {
    case inbox <- msg:
    default:
        fmt.Printf("[bus] dropped message for %s (%s) because mailbox full\n", msg.To, msg.Kind)
    }
}

func gopher(ctx context.Context, bus *Bus, name string, inbox <-chan MCPMessage, peers []string, wg *sync.WaitGroup) {
    defer wg.Done()
    rnd := rand.New(rand.NewSource(time.Now().UnixNano() + int64(len(name))))

    fmt.Printf("[%s] ready\n", name)

    for {
        select {
        case <-ctx.Done():
            fmt.Printf("[%s] shutting down\n", name)
            return

        case msg := <-inbox:
            switch msg.Kind {
            case "task":
                fmt.Printf("[%s] received task from %s: %s\n", name, msg.From, msg.Payload)

                // Sometimes ask another gopher to sanity-check before reporting completion.
                if rnd.Intn(100) < 45 && len(peers) > 0 {
                    peer := peers[rnd.Intn(len(peers))]
                    bus.Send(ctx, MCPMessage{
                        From:    name,
                        To:      peer,
                        Kind:    "review",
                        Topic:   msg.Topic,
                        Payload: msg.Payload,
                    })
                }

                time.Sleep(time.Duration(150+rnd.Intn(250)) * time.Millisecond)
                bus.Send(ctx, MCPMessage{
                    From:    name,
                    To:      "coordinator",
                    Kind:    "result",
                    Topic:   msg.Topic,
                    Payload: fmt.Sprintf("%s handled: %s", name, plan(msg.Payload)),
                })

            case "review":
                fmt.Printf("[%s] reviewing: %s\n", name, msg.Payload)
                time.Sleep(time.Duration(80+rnd.Intn(120)) * time.Millisecond)
                bus.Send(ctx, MCPMessage{
                    From:    name,
                    To:      msg.From,
                    Kind:    "review-ok",
                    Topic:   msg.Topic,
                    Payload: fmt.Sprintf("verified by %s", name),
                })

            case "review-ok":
                fmt.Printf("[%s] got peer validation from %s: %s\n", name, msg.From, msg.Payload)

            case "broadcast":
                fmt.Printf("[%s] heard broadcast from %s: %s\n", name, msg.From, msg.Payload)
            }
        }
    }
}

func plan(task string) string {
    return fmt.Sprintf("I think this is best handled with checks and a rollback plan: %s", task)
}

func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
    defer cancel()

    bus := NewBus(128)

    names := []string{"gopher-a", "gopher-b", "gopher-c"}
    inboxes := make(map[string]<-chan MCPMessage)

    coordinatorInbox := bus.Register("coordinator", 32)

    for _, name := range names {
        inboxes[name] = bus.Register(name, 32)
    }

    go bus.Start(ctx)

    // Coordinator collects all results and peer signals.
    go func() {
        for {
            select {
            case <-ctx.Done():
                fmt.Println("[coordinator] done")
                return
            case msg := <-coordinatorInbox:
                fmt.Printf("[coordinator] %s from %s (%s): %s\n", msg.Kind, msg.From, msg.Topic, msg.Payload)
            }
        }
    }()

    var wg sync.WaitGroup
    for _, name := range names {
        peers := []string{}
        for _, p := range names {
            if p != name {
                peers = append(peers, p)
            }
        }
        wg.Add(1)
        go gopher(ctx, bus, name, inboxes[name], peers, &wg)
    }

    bus.Send(ctx, MCPMessage{
        From:    "coordinator",
        To:      "",
        Kind:    "broadcast",
        Topic:   "status",
        Payload: "MCP channels are live",
    })

    tasks := []string{
        "map terrain for acorn cache",
        "stabilize bridge joints",
        "optimize burrow lighting",
        "run safety checks on trapdoor",
    }

    for _, t := range tasks {
        target := names[rand.Intn(len(names))]
        ok := bus.Send(ctx, MCPMessage{
            From:    "coordinator",
            To:      target,
            Kind:    "task",
            Topic:   "work",
            Payload: t,
        })
        if !ok {
            fmt.Printf("failed to enqueue task %q\n", t)
        }
        time.Sleep(400 * time.Millisecond)
    }

    <-ctx.Done()
    wg.Wait()
}
