use materialize_sdk::{Change, Event, LiveOptions, LiveSubscription, Subscribe, Update};

const URL: &str = "host=localhost port=26875 user=materialize";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = URL.parse()?;
    let subscribe = Subscribe::query("SELECT * FROM orders");
    let mut live =
        LiveSubscription::connect(&config, tokio_postgres::NoTls, subscribe, LiveOptions::default())
            .await?;

    while let Some(event) = live.next().await {
        match event? {
            Event::SnapshotChunk { updates } => updates.iter().for_each(print),
            Event::Batch(batch) => {
                if batch.is_snapshot() {
                    println!("snapshot as of {}", live.as_of().unwrap_or_default());
                }
                batch.updates().iter().for_each(print);
            }
        }
    }
    Ok(())
}

fn print(update: &Update) {
    if let Change::Diff { row, diff } = &update.change {
        let sign = if *diff > 0 { "+" } else { "-" };
        let cells: Vec<&str> = row.iter().map(|c| c.as_deref().unwrap_or("NULL")).collect();
        println!("{} {sign} {cells:?}", update.timestamp);
    }
}
