import prisma from "../prisma/prismaClient";

export async function getPersonaInstructions(userId: string, workspaceId: string): Promise<string> {
  let instructions = "";
  try {
    const member = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
    });
    if (member) {
      if (member.personas && member.personas.length > 0) {
        const assignedPersonas = member.personas.map((p) => p.replace(/_/g, " ")).join(", ");
        instructions += `\nYour assigned personas/roles within this workspace are: ${assignedPersonas}. You must act accordingly and adopt these roles when processing this request.`;
      }
      if (member.personaNotes) {
        instructions += `\nCRITICAL CUSTOM INSTRUCTIONS FROM WORKSPACE ADMIN:\n${member.personaNotes}\n`;
      }
    }
  } catch (err) {
    console.error("Failed to fetch WorkspaceMember personas for AI context", err);
  }
  return instructions;
}
