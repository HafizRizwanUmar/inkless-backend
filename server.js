const app = require('./core');
const PORT = process.env.PORT || 5000;

// This is the standard entry point for running the app on a VPS.
// Unlike the Vercel-specific index.js, this explicitly listens on a port.

app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`   Inkless Backend - VPS Mode`);
    console.log(`   Server running on port: ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`========================================`);
});
