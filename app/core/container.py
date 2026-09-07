"""Composition root \u2014 single place that wires concrete implementations (DIP).

Routes import ``container``, never concrete classes. The orchestrator is
constructed with both the ``MediaClient`` (image+video abstraction) and
the concrete ``WavespeedCLI`` so it can use the smart single-vs-multi
scene decision without forcing that surface onto every MediaClient impl.
"""
from functools import lru_cache

from app.core.protocols import ChatClient, MediaClient
from app.services.minimax_client import make_minimax_client
from app.services.wavespeed_client import make_wavespeed_client, WavespeedCLI
from app.services.orchestrator import Orchestrator
from app.services.sources import make_source_reader


@lru_cache(maxsize=1)
def chat() -> ChatClient:
    return make_minimax_client()


@lru_cache(maxsize=1)
def media() -> MediaClient:
    return make_wavespeed_client()


@lru_cache(maxsize=1)
def wavespeed() -> WavespeedCLI:
    return make_wavespeed_client()


@lru_cache(maxsize=1)
def orchestrator() -> Orchestrator:
    return Orchestrator(
        chat=chat(),
        media=media(),
        reader_factory=make_source_reader,
        wavespeed=wavespeed(),
    )
