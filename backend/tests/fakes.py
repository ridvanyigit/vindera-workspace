"""In-memory stand-in for the parts of the supabase-py client the backend uses.

Deliberately small: tables are lists of dicts, the query builder supports the
filters the application actually calls, and `rpc` dispatches to handlers a test
registers. Anything the application calls that is not implemented here raises
`AttributeError`, so a test never silently passes on an unsupported query.
"""

from types import SimpleNamespace
from typing import Any, Callable

from supabase import AuthError


class FakeResult(SimpleNamespace):
    """What `.execute()` returns: `.data` (a list, or whatever an RPC handler returned)."""


class Query:
    def __init__(self, db: "FakeSupabase", table: str):
        self._db = db
        self._table = table
        self._filters: list[Callable[[dict], bool]] = []
        self._mode = "select"
        self._payload: Any = None
        self._order: tuple[str, bool] | None = None
        self._slice: tuple[int, int] | None = None

    # -- verbs ---------------------------------------------------------------
    def select(self, *_columns, **_kwargs) -> "Query":
        return self

    def insert(self, payload) -> "Query":
        self._mode, self._payload = "insert", payload
        return self

    def update(self, payload: dict) -> "Query":
        self._mode, self._payload = "update", payload
        return self

    def delete(self) -> "Query":
        self._mode = "delete"
        return self

    # -- filters -------------------------------------------------------------
    def eq(self, column, value) -> "Query":
        self._filters.append(lambda row: row.get(column) == value)
        return self

    def neq(self, column, value) -> "Query":
        self._filters.append(lambda row: row.get(column) != value)
        return self

    def in_(self, column, values) -> "Query":
        self._filters.append(lambda row: row.get(column) in values)
        return self

    def is_(self, column, value) -> "Query":
        wanted_null = str(value).lower() == "null"
        self._filters.append(lambda row: (row.get(column) is None) == wanted_null)
        return self

    def lt(self, column, value) -> "Query":
        self._filters.append(lambda row: row.get(column) is not None and row[column] < value)
        return self

    def lte(self, column, value) -> "Query":
        self._filters.append(lambda row: row.get(column) is not None and row[column] <= value)
        return self

    def gte(self, column, value) -> "Query":
        self._filters.append(lambda row: row.get(column) is not None and row[column] >= value)
        return self

    # -- shaping -------------------------------------------------------------
    def order(self, column, desc: bool = False, **_kwargs) -> "Query":
        self._order = (column, desc)
        return self

    def limit(self, count: int) -> "Query":
        self._slice = (0, count - 1)
        return self

    def range(self, start: int, end: int) -> "Query":
        self._slice = (start, end)
        return self

    # -- run -----------------------------------------------------------------
    def execute(self) -> FakeResult:
        failure = self._db.failures.get(self._table)
        if failure is not None:
            raise failure

        rows = self._db.tables.setdefault(self._table, [])
        if self._mode == "insert":
            new_rows = self._payload if isinstance(self._payload, list) else [self._payload]
            created = []
            for row in new_rows:
                stored = {"id": f"{self._table}-{len(rows) + 1}", **row}
                rows.append(stored)
                created.append(dict(stored))
            return FakeResult(data=created)

        matching = [row for row in rows if all(check(row) for check in self._filters)]
        if self._mode == "update":
            for row in matching:
                row.update(self._payload)
            return FakeResult(data=[dict(row) for row in matching])
        if self._mode == "delete":
            for row in matching:
                rows.remove(row)
            return FakeResult(data=[dict(row) for row in matching])

        if self._order is not None:
            column, desc = self._order
            matching.sort(key=lambda row: (row.get(column) is None, row.get(column)), reverse=desc)
        if self._slice is not None:
            start, end = self._slice
            matching = matching[start : end + 1]
        return FakeResult(data=[dict(row) for row in matching])


class FakeAuth:
    """`supabase.auth.get_user(token)`: tokens are registered per test."""

    def __init__(self) -> None:
        self.users: dict[str, SimpleNamespace] = {}
        self.error: Exception | None = None
        self.calls = 0

    def get_user(self, token: str):
        self.calls += 1
        if self.error is not None:
            raise self.error
        user = self.users.get(token)
        if user is None:
            raise AuthError("invalid JWT", 401)
        return SimpleNamespace(user=user)


class FakeSupabase:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict]] = {}
        self.failures: dict[str, Exception] = {}
        self.rpc_handlers: dict[str, Callable[[dict], Any]] = {}
        self.rpc_calls: list[tuple[str, dict]] = []
        self.auth = FakeAuth()

    def table(self, name: str) -> Query:
        return Query(self, name)

    def rpc(self, name: str, params: dict | None = None) -> "_Rpc":
        self.rpc_calls.append((name, params or {}))
        return _Rpc(self, name, params or {})

    # -- test helpers --------------------------------------------------------
    def seed(self, table: str, *rows: dict) -> None:
        self.tables.setdefault(table, []).extend(dict(row) for row in rows)

    def add_admin(self, token: str, user_id: str = "admin-1", email: str = "owner@example.test") -> None:
        self.auth.users[token] = SimpleNamespace(id=user_id, email=email)
        self.seed("admin_users", {"user_id": user_id})

    def add_plain_user(self, token: str, user_id: str = "user-1") -> None:
        self.auth.users[token] = SimpleNamespace(id=user_id, email="someone@example.test")

    def rpc_named(self, name: str) -> list[dict]:
        return [params for called, params in self.rpc_calls if called == name]


class _Rpc:
    def __init__(self, db: FakeSupabase, name: str, params: dict):
        self._db, self._name, self._params = db, name, params

    def execute(self) -> FakeResult:
        handler = self._db.rpc_handlers.get(self._name)
        if handler is None:
            raise AssertionError(f"Unexpected RPC call: {self._name}")
        return FakeResult(data=handler(self._params))
