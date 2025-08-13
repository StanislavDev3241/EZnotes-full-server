const bcrypt = require('bcryptjs');

async function createAdminUser() {
  try {
    const email = 'admin@clearlyai.com';
    const password = 'admin_secure_password_2024';
    
    // Generate password hash
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    console.log('🔐 Admin User Credentials Generated:');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('🔒 Password Hash:', passwordHash);
    console.log('');
    console.log('📝 SQL Command to insert admin user:');
    console.log('UPDATE users SET password_hash = \'' + passwordHash + '\' WHERE email = \'' + email + '\';');
    console.log('');
    console.log('💡 Or insert new admin user:');
    console.log('INSERT INTO users (email, password_hash, role) VALUES (\'' + email + '\', \'' + passwordHash + '\', \'admin\');');
    
  } catch (error) {
    console.error('❌ Error generating admin user:', error);
  }
}

createAdminUser();
