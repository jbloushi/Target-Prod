
const axios = require('axios');
async function getToken() {
    const res = await axios.post('http://127.0.0.1:8899/api/auth/login', {
        email: 'staff@demo.com',
        password: 'password123'
    });
    console.log(res.data.token);
}
getToken();
