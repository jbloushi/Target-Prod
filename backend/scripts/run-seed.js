const seedDemoData = require('../src/services/seedDemoData');
const { connectDB } = require('../src/config/database');
const mongoose = require('mongoose');

const runCursor = async () => {
    try {
        await connectDB();
        console.log('Database connected. Starting seed...');
        await seedDemoData();
        console.log('Seed function executed.');
        process.exit(0);
    } catch (err) {
        console.error('Seed execution failed:', err);
        process.exit(1);
    }
};

runCursor();
