"""RCS robot telemetry; retain optional and vendor-specific fields."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints


class RobotTelemetry(BaseModel):
    model_config = ConfigDict(extra="allow")

    deviceCode: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
