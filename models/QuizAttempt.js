const mongoose = require('mongoose');

const QuizAttemptSchema = new mongoose.Schema({
    quiz: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    answers: [{
        questionIndex: {
            type: Number,
            required: true
        },
        selectedOptionIndex: {
            type: Number
        },
        textAnswer: {
            type: String
        },
        aiFeedback: {
            type: String
        }
    }],
    score: {
        type: Number,
        required: true
    },
    totalPoints: {
        type: Number,
        required: true
    },
    // Anti-cheat tracking (visible only to teachers)
    strikes: {
        type: Number,
        default: 0
    },
    tabSwitchCount: {
        type: Number,
        default: 0
    },
    copyAttemptCount: {
        type: Number,
        default: 0
    },
    attemptedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('QuizAttempt', QuizAttemptSchema);
