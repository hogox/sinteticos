# Worktrees

`main` es la base estable del proyecto en este repositorio:
`/Users/2b-0215/Dev/repos/sinteticos`

Cada nueva version se trabaja como una rama propia montada en un worktree
separado, dentro de una carpeta hermana:
`/Users/2b-0215/Dev/repos/sinteticos-worktrees`

## Crear una version nueva

```sh
./scripts/new-worktree.sh landing-redesign
```

Eso crea:

- la rama `version/landing-redesign`
- la carpeta `/Users/2b-0215/Dev/repos/sinteticos-worktrees/landing-redesign`

## Flujo recomendado

1. Mantener `main` como referencia base.
2. Crear cada variante en una rama `version/<nombre>`.
3. Trabajar cada variante en su propio worktree.
4. Si una variante se vuelve la nueva base, mergearla a `main`.

## Comandos utiles

```sh
git worktree list
git branch
git worktree remove ../sinteticos-worktrees/landing-redesign
git branch -D version/landing-redesign
```
