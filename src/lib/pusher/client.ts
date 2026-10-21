"use client";
import PusherClient from "pusher-js";
import { withBase } from "@/lib/base-path";

/*
 * One Pusher connection per tab, shared by every subscriber.
 *
 * The project page and the task panel each used to construct their own client,
 * and the panel built a fresh one on every task it opened — so moving between
 * tasks meant tearing a websocket down, opening a new one and re-authorizing,
 * each time, on top of the panel's own loads.
 *
 * Callers subscribe and unsubscribe their channels; nobody disconnects. pusher-js
 * reconnects on its own after a drop, and the connection dies with the tab.
 */
let client: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) return null;
  if (!client) {
    client = new PusherClient(key, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "us2",
      authEndpoint: withBase("/api/pusher/auth"),
    });
  }
  return client;
}
