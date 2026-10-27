import { LiveSubscription } from "../.sdk/misc/materialize-sdk/node/dist/index.js";

const URL = "postgres://materialize@localhost:26875/materialize";

const live = await LiveSubscription.open(URL, "SELECT * FROM orders");
for await (const event of live) {
  if (event.snapshot) console.log(`snapshot as of ${live.asOf}`);
  for (const update of event.updates) {
    const sign = update.diff > 0n ? "+" : "-";
    console.log(`${update.timestamp} ${sign} ${JSON.stringify(update.row)}`);
  }
}
