
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);

  if (index === -1) return undefined;

  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

async function main() {
  const args = process.argv.slice(2);

  const listUnowned = args.includes('--list-unowned');
  const allUnowned = args.includes('--all-unowned');
  const projectName = getArg(args, '--project-name');
  const projectId = getArg(args, '--project-id');
  const toEmail = getArg(args, '--to-email')?.trim().toLowerCase();

  if (listUnowned) {
    const projects = await prisma.project.findMany({
      where: { ownerId: null },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${projects.length} unowned project(s):`);

    for (const project of projects) {
      console.log(
        `ID: ${project.id} | Name: ${project.name} | Created: ${project.createdAt.toISOString()}`,
      );
    }

    return;
  }

  if (Number(allUnowned) + Number(Boolean(projectId)) + Number(Boolean(projectName)) !== 1) {
    throw new Error(
      'Specify exactly one of --all-unowned, --project-id, or --project-name.',
    );
  }

  if (!toEmail) {
    throw new Error('Target owner email (--to-email) is required.');
  }

  const targetUser = await prisma.user.findUnique({
    where: { email: toEmail },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (!targetUser) {
    throw new Error(`User ${toEmail} does not exist.`);
  }

  if (targetUser.role !== 'ADMIN') {
    throw new Error('Target user must have the ADMIN role.');
  }

  let projects;

  if (allUnowned) {
    projects = await prisma.project.findMany({
      where: { ownerId: null },
    });
  } else if (projectId) {
    projects = await prisma.project.findMany({
      where: { id: projectId },
    });
  } else {
    projects = await prisma.project.findMany({
      where: { name: projectName },
    });
  }

  if (projects.length === 0) {
    console.log('No matching projects found.');
    return;
  }

  if (projects.length > 1 && !allUnowned) {
    throw new Error(
      'Multiple projects match this name. Use --project-id to select one.',
    );
  }

  const alreadyOwned = projects.filter(
    (project) => project.ownerId !== null,
  );

  if (alreadyOwned.length > 0) {
    throw new Error(
      'At least one selected project already has an owner. No projects were changed.',
    );
  }

  console.log('\nProjects to assign:');

  for (const project of projects) {
    console.log(`- ${project.name} (${project.id})`);
  }

  console.log(`\nTarget administrator: ${targetUser.email}`);

  for (const project of projects) {
    const result = await prisma.project.updateMany({
      where: {
        id: project.id,
        ownerId: null,
      },
      data: {
        ownerId: targetUser.id,
      },
    });

    if (result.count !== 1) {
      throw new Error(
        `Assignment failed for project ${project.id}. Its ownership may have changed.`,
      );
    }

    console.log(`Assigned: ${project.name} (${project.id})`);
  }

  console.log('\nAssignment completed. API keys and telemetry records were not modified.');
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Assignment failed:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
