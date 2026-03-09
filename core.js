const express = require('express');

let app;

try {
    const cors = require('cors');
    const mongoose = require('mongoose');
    const dotenv = require('dotenv');

    dotenv.config();

    app = express();
    const PORT = process.env.PORT || 5000;

    app.use(cors({
        origin: [
            'https://inkless.minderfly.com',
            'http://localhost:3000',
            'http://localhost:5173',
            'https://inkless-fyp.vercel.app' // Optional fallback
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Accept'],
        credentials: true
    }));
    app.use(express.json());

    // Routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/classes', require('./routes/classes'));
    app.use('/api/quizzes', require('./routes/quizzes'));
    app.use('/api/assignments', require('./routes/assignments'));
    app.use('/api/submissions', require('./routes/submissions'));
    app.use('/api/lab-tasks', require('./routes/labTasks'));
    app.use('/api/lab-submissions', require('./routes/labSubmissions'));
    app.use('/uploads', express.static('uploads'));

    // Basic Route
    app.get('/', (req, res) => {
        res.send('Inkless API is running');
    });

    // Database Connection
    const mongoURI = process.env.MONGO_URI;
    if (mongoURI) {
        mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
            .then(() => console.log('MongoDB connected'))
            .catch((err) => console.error('MongoDB connection error:', err));
    } else {
        console.error('FATAL ERROR: MONGO_URI is not defined.');
    }

    if (require.main === module) {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    }
} catch (err) {
    console.error("Initialization error:", err);
    // If initialization fails, create a dummy app that returns the error
    app = express();
    app.all('*', (req, res) => {
        res.status(500).json({
            error: "Server Initialization Error",
            message: err.message,
            stack: err.stack,
            note: "This error was caught by the startup error boundary. It usually means a module failed to load."
        });
    });
}

module.exports = app;
