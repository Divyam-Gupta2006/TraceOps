
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Usage:
 * Create admin:
 * node dist/scripts/bootstrap-admin.js --email admin@example.com --name "Admin"
 *
 * Promote existing user:
 * node dist/scripts/bootstrap-admin.js --promote user@example.com
 */

function readHiddenPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;

    if (!stdin.isTTY) {
      reject(new Error('Password creation requires an interactive terminal.'));
      return;
    }

    process.stdout.write(prompt);

    const previousRawMode = stdin.isRaw;
    let password = '';
    let finished = false;

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(previousRawMode);
      stdin.pause();
    };

    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      process.stdout.write('\n');

      if (error) reject(error);
      else resolve(password);
    };

    const onData = (chunk: Buffer | string) => {
      const input = chunk.toString('utf8');

      for (const char of input) {
        if (char === '\u0003' || char === '\u0004') {
          finish(new Error('Operation cancelled.'));
          return;
        }

        if (char === '\r' || char === '\n') {
          finish();
          return;
        }

        if (char === '\b' || char === '\x7f') {
          password = password.slice(0, -1);
          continue;
        }

        if (char >= ' ') {
          password += char;
        }
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

function getOption(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);

  if (index === -1) return undefined;

  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const prisma = new PrismaClient();

  try {
    // Reject insecure password inputs.
    if (
      args.some(
        (arg) => arg === '--password' ||
          arg.startsWith('--password='),
      )
    ) {
      throw new Error('Passwords must never be passed as command-line arguments.');
    }

    const promoteEmail = getOption(args, '--promote');
    const createEmail = getOption(args, '--email');
    const name = getOption(args, '--name');

    if (promoteEmail && createEmail) {
      throw new Error('Use either --promote or --email, not both.');
    }

    const email = (promoteEmail || createEmail)?.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Provide a valid email address.');
    }

    // Promote an existing account.
    if (promoteEmail) {
      const existing = await prisma.user.findUnique({
        where: { email },
      });

      if (!existing) {
        throw new Error('User does not exist. Register the account first.');
      }

      if (existing.role === 'ADMIN') {
        console.log('This account is already an ADMIN. No changes made.');
        return;
      }

      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN' },
      });

      console.log(`Successfully promoted ${email} to ADMIN.`);
      return;
    }

    // Create a new administrator.
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new Error('An account with this email already exists. Use --promote if appropriate.');
    }

    const password = await readHiddenPassword('Enter administrator password: ');
    const confirmation = await readHiddenPassword('Confirm administrator password: ');

    if (password.length < 6) {
      throw new Error('Password must contain at least 6 characters.');
    }

    if (password !== confirmation) {
      throw new Error('Passwords do not match.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        role: 'ADMIN',
      },
    });

    console.log(`Administrator account created successfully: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Administrator provisioning failed:', error.message);
  process.exitCode = 1;
});
