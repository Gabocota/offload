var express = require('express')
var bodyParser = require('body-parser')
var app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
    extended: false
}))
const WebSocket = require('ws')
const fs = require('fs')
var spawn = require('child_process').spawn
const crypto = require('crypto')

const server = new WebSocket.Server({
    port: 3000
})

const CONFIG_FILE = "/home/gabocota/clustwrkr/config.json"
const config = readJson(CONFIG_FILE)

var p = {}
var outputs = {}

function hashString(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function readJson(filePath) {
    const jsonData = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(jsonData)
}

function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
}

function run(command, loc) {
    let handle = generateRandomString(10)
    let args = command.split(" ").splice(0, 1)
    p[handle] = spawn(command.split(" ")[0], args, {
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: loc
    })
    p[handle].unref()
    return handle
}

function kill(handle) {
    try {
        process.kill(-p[handle].pid);
    } catch (e) {
        return false
    }
    outputs[handle] = null;
    p[handle] = null;
    return true;
}


app.post('/run/', function (req, res) {
    console.log(req.url, req.body)
    var hashedPassword = hashString(req.body.password)
    if (hashedPassword != config.passwordHash) {
        res.json({
            "status": "invalid"
        })
        return
    }
    let newHandle = run(req.body.command, req.body.loc)
    if (!outputs[newHandle]) outputs[newHandle] = []
    p[newHandle].on('error', function (err) {
        outputs[newHandle].push(err.toString())
    })
    p[newHandle].stdout.on('data', function (data) {
        outputs[newHandle].push(data.toString())
    });
    res.json({
        "status": "valid",
        "handle": newHandle
    })
})

app.post('/kill/', function (req, res) {
    console.log(req.body)
    var hashedPassword = hashString(req.body.password)
    if (hashedPassword != config.passwordHash) {
        res.json({
            "status": "invalid"
        })
        return
    }
    if (!kill(req.body.handle)) {
        res.json({
            "status": "error"
        })
    }
    res.json({
        "status": "valid"
    })
})

server.on('connection', (ws, req) => {
    path = new URL(req.url, `http://${req.headers.host}`).pathname.slice(1);
    path = path.split("ws/")[1]
    console.log(path)

    ws.on('message', (message) => {
        try {
            console.log(message.toString())
        } catch {}
    });

    const sendOutput = setInterval(() => {
            ws.send(JSON.stringify({
                output: "ping"
            }));
    }, 1000);

    ws.on('close', () => {
        console.log("connection closed")
        clearInterval(sendOutput)
    });
});


app.listen(3001, () => {})