from materialize_sdk import LiveSubscription

URL = "postgres://materialize@localhost:26875/materialize"

with LiveSubscription(URL, "SELECT * FROM orders") as live:
    for event in live:
        if event.get("snapshot"):
            print("snapshot as of", live.as_of)
        for update in event["updates"]:
            sign = "+" if update["diff"] > 0 else "-"
            print(update["timestamp"], sign, update["row"])
