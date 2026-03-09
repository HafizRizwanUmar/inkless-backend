const mongoose = require('mongoose');

const LabTaskSchema = new mongoose.Schema({
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    title: {
        type: String, // e.g. "Lab 01: Setup & Basic Syntax"
        required: true
    },
    description: {
        type: String // e.g. "Complete the following tasks..."
    },
    taskDocument: {
        type: String // URL or Path to PDF task file
    },
    totalMarks: {
        type: Number,
        required: true
    },
    deadline: {
        type: Date
    },
    questions: [{
        questionText: { type: String, required: true },
        subMarks: { type: Number, required: true }, // Marks for this specific question
        submissionTypes: [{
            type: String,
            enum: ['code', 'output', 'image', 'text']
        }]
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('LabTask', LabTaskSchema);
