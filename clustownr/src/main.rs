use std::env;
use serde::{Deserialize, Serialize};
use signal_hook::{consts::SIGINT, iterator::Signals};
use std::{error::Error, thread, process};
use reqwest::Client;
use tokio::io::{self, AsyncBufReadExt};
use tokio::sync::mpsc;
//use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
//use url::Url;

//use hyper::Uri;

#[derive(Serialize)]
struct CommandBody {
    command: String,
    password: String,
    loc: String,
}

#[derive(Deserialize)]
struct RunBody {
    handle: String,
}


#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let mut signals = Signals::new([SIGINT])?;
    thread::spawn(move || {
        for sig in signals.forever() {
            println!("Received signal {:?}\nexiting...", sig);
            process::exit(1);
        }
    });
    let mut args: Vec<String> = env::args().collect();
    args.remove(0);
    if args.len() < 3 {
        println!("Usage: offload <command> <dir> <ip>");
        process::exit(1);
    }
    let command: String = args[0].clone();
    let dir: String = args[1].clone();
    let remote_ip: String = args[2].clone() ;
    let passkey: &str = "PASSWORD_STRING";
    let mut handle: String = String::new();

    let body = CommandBody {
        command,
        password: passkey.to_string(),
        loc: dir,
    };

    let client = Client::new();
    let url = format!("http://{}/run/", remote_ip);

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await?;

    if response.status().is_success() {
        let response_body: RunBody = response.json().await?;
        handle = response_body.handle;
        println!("Command executed successfully. Handle: {}", handle);
    } else {
        println!("Failed to execute command: {}", response.status());
    }

    let (ws_stream, _) = connect_async(format!("ws://{}/ws/{}/", remote_ip, handle)).await.expect("Failed to connect");
    println!("Connected to WebSocket");

    let (mut write, mut read) = ws_stream.split();

    let (tx, mut rx) = mpsc::unbounded_channel();

    // Task to read messages from the WebSocket and print them
    tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => print!("{}", text),
                Ok(Message::Binary(bin)) => println!("{:?}", bin),
                Ok(_) => {},
                Err(e) => {
                    eprintln!("Error reading message: {}", e);
                    break;
                }
            }
        }
    });

    // Task to read user input and send it to the WebSocket
    tokio::spawn(async move {
        let stdin = io::stdin();
        let mut reader = io::BufReader::new(stdin);
        let mut line = String::new();

        loop {
            line.clear();
            if reader.read_line(&mut line).await.unwrap() == 0 {
                break;
            }
            let trimmed_line = line.trim().to_string();
            if !trimmed_line.is_empty() {
                tx.send(trimmed_line).unwrap();
            }
        }
    });
    // Task to send messages from user input to the WebSocket
    while let Some(msg) = rx.recv().await {
        write.send(Message::Text(msg)).await.unwrap();
    }
    Ok(()) 
}
