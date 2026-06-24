// Per-session task list, shared between the todo_write tool and the REPL renderer.
let todos = [];
const listeners = new Set();

export function getTodos() {
  return todos;
}

export function setTodos(next) {
  todos = next;
  for (const fn of listeners) fn(todos);
}

export function onTodosChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
