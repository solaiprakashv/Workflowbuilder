require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./utils/database');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, { query: req.query, body: req.method !== 'GET' ? req.body : undefined });
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/steps', require('./routes/steps'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/executions', require('./routes/executions'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/metrics', require('./routes/metrics'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

module.exports = app;
