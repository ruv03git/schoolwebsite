const jwt = require('jsonwebtoken');

// The signing secret must come from the environment (see .env.example).
// A hardcoded fallback would let anyone with the source code forge tokens.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error(
    '[FATAL] JWT_SECRET is not set. Copy .env.example to .env and set a long random value.'
  );
  process.exit(1);
}

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, JWT_SECRET };
