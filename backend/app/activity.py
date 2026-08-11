from typing import Literal

from sqlalchemy import case


ActivityType = Literal["break", "shutdown", "excavation", "other_incident"]


def incident_activity_type(incident_type: str) -> ActivityType:
    if incident_type in ("suspected_leak", "confirmed_leak"):
        return "break"
    if incident_type == "planned_work":
        return "excavation"
    return "other_incident"


def incident_activity_type_expression(column):
    return case(
        (column.in_(("suspected_leak", "confirmed_leak")), "break"),
        (column == "planned_work", "excavation"),
        else_="other_incident",
    )
