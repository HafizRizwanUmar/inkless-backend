const mongoose = require('mongoose');

const QuizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    questions: [{
        type: {
            type: String,
            enum: ['MCQ', 'SHORT', 'LONG'],
            default: 'MCQ'
        },
        questionText: {
            type: String,
            required: true
        },
        options: [{
            text: {
                type: String
            }
        }],
        correctOptionIndex: {
            type: Number
        },
        points: {
            type: Number,
            default: 1
        }
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    timeLimitMinutes: {
        type: Number,
        default: null  // null means no time limit
    },
    startTime: {
        type: Date,
        default: null  // null means available immediately
    },
    endTime: {
        type: Date,
        default: null  // null means no end deadline
    },
    resultsShared: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Quiz', QuizSchema);
