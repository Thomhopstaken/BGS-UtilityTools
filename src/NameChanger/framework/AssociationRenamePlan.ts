// Association renames decided in the planning phase: domain model id -> association id -> new name.
export class AssociationRenamePlan {
  private readonly renames = new Map<string, Map<string, string>>();

  set(domainModelId: string, associationId: string, newName: string): void {
    let model = this.renames.get(domainModelId);
    if (model === undefined) {
      model = new Map<string, string>();
      this.renames.set(domainModelId, model);
    }
    model.set(associationId, newName);
    console.debug(`association rename planned: ${domainModelId}/${associationId} -> ${newName}`);
  }

  // Empty when nothing is planned for the domain model.
  get(domainModelId: string): ReadonlyMap<string, string> {
    return this.renames.get(domainModelId) ?? new Map<string, string>();
  }

  has(domainModelId: string): boolean {
    return (this.renames.get(domainModelId)?.size ?? 0) > 0;
  }

  get count(): number {
    let count = 0;
    this.renames.forEach((model) => (count += model.size));
    return count;
  }
}
