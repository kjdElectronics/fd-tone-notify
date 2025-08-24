const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const chalk = require('chalk');

/**
 * Check if the default password is still in use and show reminder
 */
async function checkDefaultPassword() {
    try {
        // Read secrets file
        const secretsPath = path.join(__dirname, '..', 'config', 'secrets.json');
        const secretsContent = await fs.readFile(secretsPath, 'utf8');
        const secrets = JSON.parse(secretsContent);
        
        const storedPassword = secrets.UI_PASSWORD_HASH;
        if (!storedPassword) {
            return false;
        }
        
        // Check if the stored password is the hashed version of "admin123"
        const isDefaultPassword = bcrypt.compareSync('admin123', storedPassword);
        
        if (isDefaultPassword) {
            // Display prominent warning about default password
            console.log('');
            console.log(chalk.yellow('⚠️  ' + '='.repeat(60)));
            console.log(chalk.yellow('⚠️  ') + chalk.bold.red('SECURITY WARNING: Default Password in Use'));
            console.log(chalk.yellow('⚠️  ') + chalk.white('The system is using the default password:'));
            console.log(chalk.yellow('⚠️  '));
            console.log(chalk.yellow('⚠️  ') + chalk.bold.cyan('Username: ') + chalk.white('admin'));
            console.log(chalk.yellow('⚠️  ') + chalk.bold.cyan('Password: ') + chalk.bold.white('admin123'));
            console.log(chalk.yellow('⚠️  '));
            console.log(chalk.yellow('⚠️  ') + chalk.white('Please change this via the web interface!'));
            console.log(chalk.yellow('⚠️  ') + chalk.white('Go to: System Configuration > Security Settings'));
            console.log(chalk.yellow('⚠️  ' + '='.repeat(60)));
            console.log('');
            console.log(chalk.blue('🔒 ') + chalk.yellow('SSL CERTIFICATE SETUP REQUIRED'));
            console.log(chalk.blue('🔒 ') + chalk.white('Before using the web interface:'));
            console.log(chalk.blue('🔒 ') + chalk.white('1. Visit: ') + chalk.cyan('https://localhost:3000'));
            console.log(chalk.blue('🔒 ') + chalk.white('2. Accept the self-signed certificate warning'));
            console.log(chalk.blue('🔒 ') + chalk.white('3. Visit: ') + chalk.cyan('https://localhost:3001'));
            console.log(chalk.blue('🔒 ') + chalk.white('4. Then use the web interface normally'));
            console.log(chalk.blue('🔒 ' + '='.repeat(60)));
            console.log('');
            
            return true;
        }
        
        return false;
        
    } catch (error) {
        // If we can't check, assume it's not default and don't show warning
        return false;
    }
}

module.exports = { checkDefaultPassword };