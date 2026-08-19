document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  msg.className = 'msg';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    const { token, user } = await API.post('/api/login', { email, password });
    API.setToken(token);
    const next = new URLSearchParams(window.location.search).get('next');
    if (next) { window.location.href = next; return; }
    window.location.href = user.role === 'admin' ? '/admin/index.html' : '/dashboard.html';
  } catch (err) {
    showMsg(msg, err.data?.error || 'Log in failed.', 'error');
  }
});
