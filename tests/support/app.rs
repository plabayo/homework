// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::error::Error;
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

type TestResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

pub struct TestApp {
    addr: SocketAddr,
    child: Child,
}

impl TestApp {
    pub fn spawn() -> TestResult<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let addr = listener.local_addr()?;
        drop(listener);

        let mut child = Command::new(env!("CARGO_BIN_EXE_homework"))
            .arg("--http")
            .arg(addr.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;

        wait_for_port(addr, &mut child)?;

        Ok(Self { addr, child })
    }

    /// Spawn with HTTPS on TCP and HTTP/3 on UDP, both on one port as in
    /// production, behind a self-signed `localhost` certificate. The TCP
    /// listener binds after the QUIC endpoint, so once it accepts both are up.
    pub fn spawn_https_h3() -> TestResult<Self> {
        let (http, port) = loop {
            let http = TcpListener::bind("127.0.0.1:0")?.local_addr()?;
            let tcp = TcpListener::bind("127.0.0.1:0")?;
            let port = tcp.local_addr()?.port();
            // The UDP port must be free as well; retry on the rare clash.
            if UdpSocket::bind(("127.0.0.1", port)).is_ok() {
                break (http, port);
            }
        };
        let addr = SocketAddr::from(([127, 0, 0, 1], port));

        let mut child = Command::new(env!("CARGO_BIN_EXE_homework"))
            .arg("--http")
            .arg(http.to_string())
            .arg("--https")
            .arg(addr.to_string())
            .arg("--h3")
            .arg(addr.to_string())
            .arg("--self-signed")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;

        wait_for_port(addr, &mut child)?;

        Ok(Self { addr, child })
    }

    pub fn port(&self) -> u16 {
        self.addr.port()
    }

    pub fn base_url(&self) -> String {
        format!("http://{}", self.addr)
    }

    pub fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url(), path)
    }

    pub fn stop(&mut self) {
        terminate_child(&mut self.child);
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        self.stop();
    }
}

fn wait_for_port(addr: SocketAddr, child: &mut Child) -> TestResult<()> {
    let deadline = Instant::now() + Duration::from_secs(10);

    loop {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            return Ok(());
        }

        if let Some(status) = child.try_wait()? {
            return Err(format!("homework server exited early with status {status}").into());
        }

        if Instant::now() >= deadline {
            return Err(format!("timed out waiting for homework server on {addr}").into());
        }

        sleep(Duration::from_millis(100));
    }
}

fn terminate_child(child: &mut Child) {
    match child.try_wait() {
        Ok(Some(_)) => return,
        Ok(None) => {}
        Err(_) => return,
    }

    let _ = child.kill();
    let _ = child.wait();
}
