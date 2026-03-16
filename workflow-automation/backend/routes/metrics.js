const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const Execution = require('../models/Execution');
const Workflow = require('../models/Workflow');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const [
      totalWorkflows, activeWorkflows, totalExecutions,
      statusCounts, recentExecutions, avgDuration
    ] = await Promise.all([
      Workflow.countDocuments(),
      Workflow.countDocuments({ is_active: true }),
      Execution.countDocuments(),
      Execution.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Execution.find().sort({ created_at: -1 }).limit(30).select('status started_at ended_at workflow_id retries'),
      Execution.aggregate([
        { $match: { status: 'completed', started_at: { $ne: null }, ended_at: { $ne: null } } },
        { $project: { duration: { $subtract: ['$ended_at', '$started_at'] } } },
        { $group: { _id: null, avg: { $avg: '$duration' }, max: { $max: '$duration' }, min: { $min: '$duration' } } }
      ])
    ]);

    const statusMap = statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});

    // Success rate
    const completed = statusMap.completed || 0;
    const failed = statusMap.failed || 0;
    const successRate = (completed + failed) > 0 ? Math.round((completed / (completed + failed)) * 100) : 0;

    // Daily execution trend (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dailyTrend = await Execution.aggregate([
      { $match: { created_at: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
        count: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalWorkflows, activeWorkflows, totalExecutions,
          successRate,
          avgDurationMs: avgDuration[0]?.avg || 0,
          maxDurationMs: avgDuration[0]?.max || 0
        },
        statusBreakdown: statusMap,
        dailyTrend,
        recentExecutions
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
