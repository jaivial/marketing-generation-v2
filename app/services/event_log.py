"""Campaign event hub -- persistence + live fan-out (one small job each).

* Persistence lives in ``app.services.storage`` (append-only SQLite rows).
* This module adds the in-process fan-out: one ``asyncio.Queue`` per
  subscriber so a background run can push events to every connected client.

Ordering contract (coordination id: pipeline.event_log): the event is written
to the store *before* it is handed to any queue, so a client that reconnects
replays exactly what a live client sees -- never less.
"""
from __future__ import annotations
import asyncio
from typing import Any, AsyncIterator

from app.services import storage

#: Terminal events -- the stream closes once the run is over.
TERMINAL_EVENTS = ("done", "error")


def publish(campaign_id: str, event: str, data: Any) -> dict:
    """Append the event to the store, then hand it to live subscribers."""
    seq = storage.append_campaign_event(campaign_id, event, data)
    item = {"campaign_id": campaign_id, "seq": seq,
            "event": event, "data": data or {}}
    for q in list(_SUBS.get(campaign_id, ())):
        q.put_nowait(item)
    return item


def replay(campaign_id: str) -> list[dict]:
    """Every event already persisted for this campaign, in order."""
    return storage.list_campaign_events(campaign_id)


def subscribe(campaign_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _SUBS.setdefault(campaign_id, []).append(q)
    return q


def unsubscribe(campaign_id: str, q: asyncio.Queue) -> None:
    subs = _SUBS.get(campaign_id)
    if subs and q in subs:
        subs.remove(q)
    if subs is not None and not subs:
        _SUBS.pop(campaign_id, None)


async def stream(campaign_id: str) -> AsyncIterator[dict]:
    """Replay the stored history, then follow the live queue until the run ends.

    Subscribing *before* replaying (and dropping duplicates by ``seq``) means
    no event can slip through the gap between the two.
    """
    q = subscribe(campaign_id)
    try:
        seen = 0
        history = replay(campaign_id)
        for item in history:
            seen = item["seq"]
            yield item
        if history and history[-1]["event"] in TERMINAL_EVENTS:
            return          # the run is already over -- nothing left to tail
        while True:
            item = await q.get()
            if item["seq"] <= seen:
                continue
            yield item
            if item["event"] in TERMINAL_EVENTS:
                return
    finally:
        unsubscribe(campaign_id, q)


_SUBS: dict[str, list[asyncio.Queue]] = {}
