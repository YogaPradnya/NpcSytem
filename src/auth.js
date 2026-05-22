function parseSignedUser(req) {
    if (!req.signedCookies.user) return null;
    try {
        return JSON.parse(req.signedCookies.user);
    } catch (e) {
        return null;
    }
}

function sessionAuth(req, res, next) {
    if (req.signedCookies.user) {
        req.user = parseSignedUser(req);
        next();
    } else {
        res.redirect('/login');
    }
}

function apiAuth(req, res, next) {
    if (req.signedCookies.user) {
        req.user = parseSignedUser(req);
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
}

function adminOnly(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).send("Akses Ditolak: Khusus Admin!");
    }
}

module.exports = {
    sessionAuth,
    apiAuth,
    adminOnly
};
