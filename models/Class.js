const mongoose = require('mongoose');

const ClassSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    section: {
        type: String
    },
    subject: {
        type: String
    },
    room: {
        type: String
    },
    code: {
        type: String,
        unique: true,
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    teachers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    theme: {
        type: String,
        default: 'bg-gradient-to-r from-blue-600 to-indigo-600'
    },
    isArchived: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Class', ClassSchema);
