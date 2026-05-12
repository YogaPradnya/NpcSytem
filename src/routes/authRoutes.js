const express = require('express');

function createAuthRoutes({ getLoginPageHTML }) {
    const router = express.Router();

    router.get('/login', (req, res) => {
        if (req.signedCookies.user) return res.redirect('/admin');
        res.send(getLoginPageHTML());
    });

    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        let role = null;
        const userIn = (username || '').trim();
        const passIn = (password || '').trim();

        if (userIn === process.env.ADMIN_USER && passIn === process.env.ADMIN_PASS) {
            role = 'admin';
        } else if (userIn === process.env.MOD_USER && passIn === process.env.MOD_PASS) {
            role = 'asisten';
        }

        if (role) {
            res.cookie('user', JSON.stringify({ username, role }), {
                signed: true,
                httpOnly: true,
                maxAge: 86400000 * 7
            });
            res.redirect('/admin');
        } else {
            res.send(getLoginPageHTML('Username atau Password salah!'));
        }
    });

    router.get('/logout', (req, res) => {
        res.clearCookie('user');
        res.redirect('/login');
    });

    return router;
}

module.exports = {
    createAuthRoutes
};
