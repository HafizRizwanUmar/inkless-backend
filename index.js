const express = require('express');

// We intentionally defer requiring the actual app code until the first request
// This prevents Vercel from crashing during the "cold start" evaluation phase,
// which is what causes the generic 500 FUNCTION_INVOCATION_FAILED error.
// Now, if `core.js` fails to initialize, the error will be caught here and 
// served in the HTTP response so we can actually read it!

let realApp = null;
let startupError = null;

try {
    // Attempt to evaluate the real app
    realApp = require('./core.js');
} catch (err) {
    startupError = err;
    console.error("Vercel Cold Start Error:", err);
}

const app = express();

app.use((req, res) => {
    if (startupError) {
        return res.status(500).json({
            error: "Vercel Cold Start Error Caught",
            message: startupError.message,
            stack: startupError.stack,
            note: "This error happened during the initial require('./core.js')."
        });
    }

    if (realApp) {
        // Forward the request to the real application
        return realApp(req, res);
    } else {
        return res.status(500).json({ error: "App did not initialize but no error was caught?" });
    }
});

module.exports = app;
