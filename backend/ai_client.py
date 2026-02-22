import json
import re
import time
from typing import Any, Dict, List, Protocol

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError


AI_MODEL = "openai/gpt-4o-mini"
AI_PING_PROMPT = "Answer with only the result of 2+2."


class AIClient(Protocol):
    def ping(self) -> str:
        ...

    def chat(
        self,
        board_payload: Dict[str, Any],
        history: List[Dict[str, str]],
        user_message: str,
    ) -> Dict[str, Any]:
        ...


class OpenAIPingClient:
    def __init__(self, api_key: str, timeout_seconds: float = 20.0) -> None:
        self.client = OpenAI(api_key=api_key, timeout=timeout_seconds)
        # Keep the project-level model id, but map to OpenAI-native id for this SDK.
        self.provider_model = AI_MODEL.replace("openai/", "", 1)

    def _create_with_retry(self, input_value: str):
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                return self.client.responses.create(
                    model=self.provider_model,
                    input=input_value,
                )
            except (RateLimitError, APIConnectionError, APITimeoutError) as exc:
                last_error = exc
                if attempt == 2:
                    raise
                time.sleep(0.7 * (attempt + 1))
            except APIStatusError as exc:
                last_error = exc
                status = getattr(exc, "status_code", None)
                if attempt == 2 or (status is not None and status < 500):
                    raise
                time.sleep(0.7 * (attempt + 1))

        if last_error is not None:
            raise last_error

    def ping(self) -> str:
        response = self._create_with_retry(AI_PING_PROMPT)

        text = getattr(response, "output_text", None)
        if text is None:
            raise RuntimeError("OpenAI response did not contain output_text")
        return text.strip()

    def chat(
        self,
        board_payload: Dict[str, Any],
        history: List[Dict[str, str]],
        user_message: str,
    ) -> Dict[str, Any]:
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

        last_error: Exception | None = None
        response = None
        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model=self.provider_model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                )
                break
            except (RateLimitError, APIConnectionError, APITimeoutError) as exc:
                last_error = exc
                if attempt == 2:
                    raise
                time.sleep(0.7 * (attempt + 1))
            except APIStatusError as exc:
                last_error = exc
                status = getattr(exc, "status_code", None)
                if attempt == 2 or (status is not None and status < 500):
                    raise
                time.sleep(0.7 * (attempt + 1))

        if response is None:
            if last_error is not None:
                raise last_error
            raise RuntimeError("OpenAI chat request failed with unknown error")

        if not response.choices:
            raise RuntimeError("OpenAI chat response was empty")
        text = response.choices[0].message.content
        if text is None:
            raise RuntimeError("OpenAI chat response content was empty")
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            # Some responses include JSON inside markdown fences or extra text.
            match = re.search(r"\{[\s\S]*\}", text)
            if not match:
                raise RuntimeError("OpenAI chat response was not valid JSON") from exc
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError as nested_exc:
                raise RuntimeError("OpenAI chat response was not valid JSON") from nested_exc
