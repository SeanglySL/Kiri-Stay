document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  msg.className = 'msg';
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    const { token } = await API.post('/api/register', { name, email, password });
    API.setToken(token);
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = next || '/dashboard.html';
  } catch (err) {
    showMsg(msg, err.data?.error || 'Registration failed.', 'error');
  }
});
