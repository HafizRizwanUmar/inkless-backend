const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
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
    deadline: {
        type: Date
    },
    marks: {
        type: Number
    },
    fileUrl: {
        type: String // Path to the uploaded file
    },
    enableAI: {
        type: Boolean,
        default: false
    },
    submissionTypes: {
        code: { type: Boolean, default: false },
        output: { type: Boolean, default: false },
        image: { type: Boolean, default: false }
    },
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

module.exports = mongoose.model('Assignment', AssignmentSchema);
