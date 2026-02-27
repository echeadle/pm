import json
import re
import time
from typing import Any

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError


AI_MODEL = "openai/gpt-4o-mini"
AI_PING_PROMPT = "Answer with only the result of 2+2."


def _retry_on_transient(fn):
    for attempt in range(3):
        try:
            return fn()
        except (RateLimitError, APIConnectionError, APITimeoutError):
            if attempt == 2:
                raise
            time.sleep(0.7 * (attempt + 1))
        except APIStatusError as exc:
            status = getattr(exc, "status_code", None)
            if attempt == 2 or (status is not None and status < 500):
                raise
            time.sleep(0.7 * (attempt + 1))


def _extract_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise RuntimeError("OpenAI chat response was not valid JSON") from exc
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as nested_exc:
            raise RuntimeError("OpenAI chat response was not valid JSON") from nested_exc


class OpenAIPingClient:
    def __init__(self, api_key: str, timeout_seconds: float = 20.0) -> None:
        self.client = OpenAI(api_key=api_key, timeout=timeout_seconds)
        self.provider_model = AI_MODEL.replace("openai/", "", 1)

    def ping(self) -> str:
        response = _retry_on_transient(
            lambda: self.client.responses.create(
                model=self.provider_model,
                input=AI_PING_PROMPT,
            )
        )

        text = getattr(response, "output_text", None)
        if text is None:
            raise RuntimeError("OpenAI response did not contain output_text")
        return text.strip()

    def chat(
        self,
        board_payload: dict[str, Any],
        history: list[dict[str, str]],
        user_message: str,
    ) -> dict[str, Any]:
        system_prompt = (
            "You are a kanban assistant.\n"
            "Return strict JSON with shape:\n"
            "{\"assistant_message\": string, \"board_update\": object|null}\n"
            "If board_update is present it must match:\n"
            "{\"version\": 1, \"board\": {\"columns\": [{\"id\": string, \"title\": string, \"cards\": [{\"id\": string, \"title\": string, \"details\": string}]}]}}\n"
            "No markdown. JSON only."
        )
        user_prompt = (
            f"Current board JSON:\n{json.dumps(board_payload)}\n\n"
            f"Conversation history JSON:\n{json.dumps(history)}\n\n"
            f"User message:\n{user_message}\n"
        )

        response = _retry_on_transient(
            lambda: self.client.chat.completions.create(
                model=self.provider_model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
        )

        if response is None:
            raise RuntimeError("OpenAI chat request failed with unknown error")

        if not response.choices:
            raise RuntimeError("OpenAI chat response was empty")
        text = response.choices[0].message.content
        if text is None:
            raise RuntimeError("OpenAI chat response content was empty")
        return _extract_json(text)
