var express = require("express");
var bodyParser = require("body-parser");
var app = express();
app.use(bodyParser.json());
app.use(
    bodyParser.urlencoded({
        extended: false,
    })
);
const WebSocket = require("ws");
const fs = require("fs");
var spawn = require("child_process").spawn;
const crypto = require("crypto");

const server = new WebSocket.Server({
    port: 3000,
});

const CONFIG_FILE = "/home/gabocota/clustwrkr/config.json";
const config = readJson(CONFIG_FILE);

var p = {};
var outputs = {};

function hashString(input) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

function readJson(filePath) {
    const jsonData = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(jsonData);
}

function generateRandomString(length) {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function run(command, loc) {
    let handle = generateRandomString(10);
    let args = command.split(" ").splice(1, command.split(" ").length - 1);
    try {
        p[handle] = spawn(command.split(" ")[0], args, {
            detached: true,
            stdio: ["pipe", "pipe", "pipe"],
            cwd: loc,
        });
        p[handle].unref();
        if (!outputs[handle]) outputs[handle] = [];
        p[handle].on("error", function (err) {
            outputs[handle].push(err.toString());
        });
        p[handle].stdout.on("data", function (data) {
            outputs[handle].push(data.toString());
        });
        outputs[handle].push(`PID: ${p[handle].pid}`);
    } catch (e) {
        console.log(e)
    }
    return handle;
}

function kill(handle) {
    if (p[handle]) {
        p[path].stdin.write(`stop\n`);
        p[handle].kill("SIGINT");
        setTimeout(() => {
            if (p[handle]) {
                p[handle].kill("SIGKILL");
            }
            outputs[handle] = null;
            p[handle] = null;
        }, 5000);
    }
}

app.post("/run/", function (req, res) {
    var hashedPassword = hashString(req.body.password);
    if (hashedPassword != config.passwordHash) {
        res.status(403);
        return;
    }
    let newHandle = run(req.body.command, req.body.loc);
    res.json({
        handle: newHandle,
    });
});

app.post("/kill/", function (req, res) {
    var hashedPassword = hashString(req.body.password);
    if (hashedPassword != config.passwordHash) {
        res.status(403);
        return;
    }
    if (!kill(req.body.handle)) {
        res.status(505);
    }
    res.status(200);
});

server.on("connection", (ws, req) => {
    const heartbeat = () => {
        if (ws.isAlive === false) {
            console.log("Terminating connection due to inactivity");
            return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping(() => {});
    };
    ws.isAlive = true;
    ws.on("pong", () => {
        ws.isAlive = true;
    });

    const interval = setInterval(heartbeat, 5000);

    ws.on("message", (message) => {
        try {
            path = new URL(req.url, `http://${req.headers.host}`).pathname.slice(1);
            path = path.split("ws/")[1].split("/")[0];
            if (message.toString()) {
                console.log(`Wrote ${message.toString()} on ${path}`);
                p[path].stdin.write(message.toString() + "\n");
            }
        } catch {}
    });

    const sendOutput = setInterval(() => {
        path = new URL(req.url, `http://${req.headers.host}`).pathname.slice(1);
        path = path.split("ws/")[1].split("/")[0];
        if (outputs[path] && outputs[path].length > 0) {
            const outputData = outputs[path].join("\n");
            console.log(outputData)
            ws.send(outputData);
            outputs[path] = [];
        }
    }, 100);

    ws.on("close", () => {
        path = new URL(req.url, `http://${req.headers.host}`).pathname.slice(1);
        path = path.split("ws/")[1].split("/")[0];
        console.log(`Closed ${path}`);
        kill(path);
        clearInterval(sendOutput);
        clearInterval(interval);
    });
});

app.listen(3001, () => {});