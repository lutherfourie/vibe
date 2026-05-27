package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

type Message struct {
	From    string
	Payload string
	ReplyTo chan Message
}

func gopher(name string, inbox <-chan Message, peers map[string]chan Message, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case msg := <-inbox:
			fmt.Printf("%s received from %s: %s\n", name, msg.From, msg.Payload)
			if msg.ReplyTo != nil {
				out := Message{From: name, Payload: fmt.Sprintf("ack:%s", msg.Payload), ReplyTo: nil}
				msg.ReplyTo <- out
			}
			if target, ok := peers[msg.Payload]; ok {
				target <- Message{From: name, Payload: fmt.Sprintf("hello from %s", name), ReplyTo: nil}
			}
		case <-done:
			fmt.Printf("%s shutting down\n", name)
			return
		case <-time.After(time.Duration(rand.Intn(250)+150) * time.Millisecond):
			// spontaneous thought: tell everyone what we are up to
			for _, p := range peers {
				if p != nil {
					p <- Message{From: name, Payload: "status", ReplyTo: nil}
					break
				}
			}
		}
	}
}

func main() {
	rand.Seed(time.Now().UnixNano())

	done := make(chan struct{})

	topo := map[string]chan Message{
		"A": make(chan Message, 8),
		"B": make(chan Message, 8),
		"C": make(chan Message, 8),
	}

	inboxes := map[string]chan<- Message{}
	for name, ch := range topo {
		inboxes[name] = ch
	}

	var wg sync.WaitGroup
	for name, inbox := range topo {
		peers := map[string]chan Message{}
		for p, ch := range topo {
			if p != name {
				peers[p] = ch
			}
		}
		wg.Add(1)
		go gopher(name, inbox, peers, done, &wg)
	}

	reply := make(chan Message, 8)
	topo["A"] <- Message{From: "starter", Payload: "B", ReplyTo: reply}
	caseMsg := <-reply
	fmt.Printf("starter got direct reply: %s <- %s\n", caseMsg.Payload, caseMsg.From)

	topo["C"] <- Message{From: "starter", Payload: "B", ReplyTo: nil}

	select {
	case m := <-reply:
		fmt.Printf("unexpected extra reply: %s from %s\n", m.Payload, m.From)
	case <-time.After(1 * time.Second):
		fmt.Println("no extra direct replies")
	}

	fmt.Println("broadcasting stop signal in", 2*time.Second)
	time.Sleep(2 * time.Second)
	close(done)
	wg.Wait()
}
