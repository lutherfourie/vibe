package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

type Message struct {
	ID      int
	From    string
	To      string
	Topic   string
	Payload string
	Hops    int
	ReplyTo chan Message
	Trace   []string
}

type Role string

const (
	RoleRouter   Role = "router"
	RolePlanner  Role = "planner"
	RoleReviewer Role = "reviewer"
)

func roleForTopic(topic string) Role {
	switch topic {
	case "plan":
		return RolePlanner
	case "review":
		return RoleReviewer
	default:
		return RoleRouter
	}
}

func sendMsg(to chan Message, msg Message, reason string) {
	if msg.Hops <= 0 {
		fmt.Printf("drop[%s] %s (id=%d)\n", reason, msg.Payload, msg.ID)
		return
	}
	msg.Hops--
	select {
	case to <- msg:
	default:
		fmt.Printf("backpressure[%s] drop %s (id=%d)\n", reason, msg.Payload, msg.ID)
	}
}

func routeTo(msg Message, role Role, peers map[string]chan Message, name string) chan Message {
	if msg.To != "" && msg.To != name {
		return peers[msg.To]
	}
	target := roleForTopic(msg.Topic)
	if target == role {
		return nil
	}

	if role != RoleRouter {
		return peers["A"]
	}
	for peerName, peer := range peers {
		if peerName == "B" && target == RolePlanner {
			return peer
		}
		if peerName == "C" && target == RoleReviewer {
			return peer
		}
	}
	for _, peer := range peers {
		return peer
	}
	return nil
}

func gopher(name string, role Role, inbox <-chan Message, peers map[string]chan Message, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	heartbeat := time.NewTicker(350 * time.Millisecond)
	defer heartbeat.Stop()

	for {
		select {
		case msg := <-inbox:
			msg.Trace = append(msg.Trace, name)
			fmt.Printf("%s[%s] in=%q from=%s topic=%s hops=%d\n", name, role, msg.Payload, msg.From, msg.Topic, msg.Hops)
			if msg.Topic == "ping" {
				fmt.Printf("%s observes heartbeat trace=%v\n", name, msg.Trace)
				continue
			}

			if next := routeTo(msg, role, peers, name); next != nil {
				fmt.Printf("%s routes %s -> next peer\n", name, msg.Payload)
				sendMsg(next, msg, "route")
				continue
			}

			if msg.ReplyTo != nil {
				reply := Message{
					ID:      msg.ID,
					From:    name,
					To:      msg.From,
					Topic:   msg.Topic,
					Payload: fmt.Sprintf("handled by %s (%s)", name, role),
					Trace:   msg.Trace,
					Hops:    4,
				}
				sendMsg(msg.ReplyTo, reply, "reply")
			}
		case <-heartbeat.C:
			targets := make([]string, 0, len(peers))
			for peerName := range peers {
				targets = append(targets, peerName)
			}
			if len(targets) == 0 {
				continue
			}
			chosen := peers[targets[rand.Intn(len(targets))]]
			heartbeatMsg := Message{
				From:    name,
				To:      "",
				Topic:   "ping",
				Payload: "heartbeat",
				Hops:    1,
			}
			sendMsg(chosen, heartbeatMsg, "heartbeat")
		case <-done:
			fmt.Printf("%s shutting down\n", name)
			return
		}
	}
}

func main() {
	rand.Seed(time.Now().UnixNano())
	done := make(chan struct{})
	inboxes := map[string]chan Message{
		"A": make(chan Message, 16),
		"B": make(chan Message, 16),
		"C": make(chan Message, 16),
	}
	roles := map[string]Role{
		"A": RoleRouter,
		"B": RolePlanner,
		"C": RoleReviewer,
	}
	peerMap := map[string]map[string]chan Message{}
	for name := range inboxes {
		peerMap[name] = map[string]chan Message{}
		for peerName, peerInbox := range inboxes {
			if peerName == name {
				continue
			}
			peerMap[name][peerName] = peerInbox
		}
	}

	var wg sync.WaitGroup
	for name, role := range roles {
		wg.Add(1)
		go gopher(name, role, inboxes[name], peerMap[name], done, &wg)
	}

	reply := make(chan Message, 4)
	inboxes["A"] <- Message{
		ID:      1,
		From:    "starter",
		To:      "B",
		Topic:   "plan",
		Payload: "create bootstrap lane",
		Hops:    4,
		ReplyTo: reply,
		Trace:   []string{"starter"},
	}
	inboxes["A"] <- Message{
		ID:      2,
		From:    "starter",
		To:      "C",
		Topic:   "review",
		Payload: "audit handoff scope",
		Hops:    4,
		ReplyTo: reply,
		Trace:   []string{"starter"},
	}
	inboxes["A"] <- Message{
		ID:      3,
		From:    "starter",
		To:      "",
		Topic:   "mystery",
		Payload: "general query",
		Hops:    4,
		ReplyTo: reply,
		Trace:   []string{"starter"},
	}

	for i := 0; i < 3; i++ {
		select {
		case msg := <-reply:
			fmt.Printf("starter got reply: id=%d from=%s topic=%s trace=%v payload=%q\n", msg.ID, msg.From, msg.Topic, msg.Trace, msg.Payload)
		case <-time.After(750 * time.Millisecond):
			fmt.Println("starter timed out waiting for reply")
		}
	}

	time.Sleep(1 * time.Second)
	close(done)
	wg.Wait()
	fmt.Println("smart gopher lane demo complete")
}
