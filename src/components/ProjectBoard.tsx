import type { ReactNode } from 'react';
import type { Project } from '../types/v2';

interface ProjectBoardProps {
  project: Project;
  children: ReactNode;
}

export function ProjectBoard({
  project,
  children,
}: ProjectBoardProps) {
  return (
    <section className="board" aria-label={`${project.name} board`} data-project-id={project.id}>
      {children}
    </section>
  );
}
