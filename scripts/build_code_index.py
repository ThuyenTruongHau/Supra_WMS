"""Build source indexes and check links for PROJECT_DOCS without importing the app.

Uses Python's standard library only. Does not read legacy docs, .env, logs, assets
or execute application code. TypeScript symbols are identified by regex and are
an orientation aid, not a complete TypeScript parser.
"""

from __future__ import annotations

import argparse
import ast
from collections import defaultdict
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "PROJECT_DOCS"
INDEX = DOCS / "index"
BACKEND_ROOTS = ("backend/app/", "backend/alembic/", "backend/scripts/", "backend/test/", "backend/tests/")
FRONTEND_ROOTS = ("frontend/src/", "frontend/tests/")
FRONTEND_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"}
BACKEND_CONFIG = {"backend/requirements.txt", "backend/pyproject.toml", "backend/Dockerfile", "backend/alembic.ini"}
FRONTEND_CONFIG = {"frontend/package.json", "frontend/vite.config.ts", "frontend/eslint.config.js", "frontend/Dockerfile", "frontend/nginx.conf"}
SKIP_PARTS = {"__pycache__", "node_modules", ".venv", "static", "assets", "dist", "logs", ".git"}
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "websocket"}
TS_SYMBOLS = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)"
    r"|^export\s+(?:default\s+)?(?:const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)


def source_paths() -> list[Path]:
    """Tracked and nonignored untracked paths: generated files stay out of the index."""
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT, check=True, capture_output=True,
    )
    names = set(result.stdout.decode("utf-8").split("\0")) - {""}
    return [ROOT / name for name in sorted(names, key=lambda name: (name.casefold(), name))
            if (ROOT / name).is_file() and not SKIP_PARTS.intersection(Path(name).parts)]


def text_of(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def source_link(path: Path, label: str | None = None, line: int | None = None) -> str:
    # All generated indexes are exactly two directories below the repository root.
    target = "../../" + path.relative_to(ROOT).as_posix()
    target = quote(target, safe="/._-")
    if line:
        target += f"#L{line}"
    return f"[{label or path.name}]({target})"


def py_symbols(path: Path) -> list[tuple[str, int]]:
    tree = ast.parse(text_of(path), filename=path.relative_to(ROOT).as_posix())
    return [(node.name, node.lineno) for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]


def ts_symbols(path: Path) -> list[tuple[str, int]]:
    source = text_of(path)
    return [((match.group(1) or match.group(2)), source.count("\n", 0, match.start()) + 1)
            for match in TS_SYMBOLS.finditer(source)]


def role_of(path: Path) -> str:
    name = path.relative_to(ROOT).as_posix()
    if "/test/" in name or "/tests/" in name:
        return "Kiểm thử; đọc setup/fixture trước khi chạy"
    if "/alembic/versions/" in name:
        return "Migration DB"
    if "/alembic/" in name:
        return "Cấu hình/thực thi Alembic"
    if "/scripts/" in name:
        return "Script phụ trợ; đọc side effect trước khi chạy"
    if path.name == "__init__.py":
        return "Khởi tạo package Python"
    if name in BACKEND_CONFIG or name in FRONTEND_CONFIG:
        return "Manifest/cấu hình công cụ hoặc triển khai"
    if name == "backend/app/main.py":
        return "Điểm vào FastAPI và đăng ký router"
    if "/core/" in name:
        return "Hạ tầng/cấu hình dùng chung"
    if "/socket/" in name:
        return "WebSocket/event/pubsub"
    for suffix, role in (
        ("_celery_task.py", "Entry tác vụ Celery"),
        ("_api.py", "Khai báo/handler API"),
        ("_schema.py", "Schema/DTO/validation"),
        ("_model.py", "Model dữ liệu/ORM"),
        ("_service.py", "Service nghiệp vụ/tích hợp"),
    ):
        if path.name.endswith(suffix):
            return role
    if name.startswith("frontend/src/"):
        folder = name.split("/")[2]
        return {
            "pages": "Màn hình; xem router để biết nơi sử dụng",
            "components": "Component/UI dùng lại hoặc theo nghiệp vụ",
            "api": "Client HTTP/hợp đồng request",
            "hooks": "Hook React/dữ liệu/realtime",
            "types": "Khai báo kiểu dữ liệu FE",
            "store": "Trạng thái dùng chung",
            "utils": "Hàm hỗ trợ/chuyển đổi/render/nghiệp vụ FE",
            "constants": "Hằng số/ánh xạ",
            "config": "Cấu hình FE",
            "routes": "Định tuyến",
            "styles": "CSS/bố cục",
            "data": "Dữ liệu/metadata; cần xem nơi sử dụng",
            "i18n": "Nhãn/thông báo theo ngôn ngữ",
            "layouts": "Bố cục",
        }.get(folder, "Điểm vào hoặc cấu hình source FE")
    return "Module hỗ trợ; đọc khai báo và nơi gọi"


def file_index(paths: list[Path], frontend: bool) -> str:
    title = "Frontend" if frontend else "Backend"
    lines = [f"# Chỉ mục source {title}", "",
             "Sinh bằng `python scripts/build_code_index.py`; không sửa bảng bằng tay.", "",
             f"**{len(paths)} file**. Chỉ quét file Git đang theo dõi hoặc chưa bị ignore trong phạm vi được mô tả dưới đây.", "",
             "Vai trò là phân loại theo vị trí/tên file. Tên hàm/lớp là khai báo cấu trúc, không chứng minh hành vi đã chạy.",
             "Python dùng AST, chỉ lấy hàm/lớp cấp module; FE dùng regex để nhận diện function/export cấp dòng nên có thể không liệt kê mọi kiểu khai báo.",
             "Mỗi dòng hiển thị tối đa 8 tên; mở source để xem đầy đủ. File `.d.ts` cũng được liệt kê nếu nằm trong phạm vi.", "",
             ("Phạm vi: `frontend/src`, `frontend/tests` và các manifest/cấu hình FE được chọn; loại asset/generated."
              if frontend else "Phạm vi: `backend/app`, `backend/alembic`, `backend/scripts`, `backend/test`, `backend/tests` và manifest/cấu hình được chọn; loại static/generated."),
             "", "Quay lại [bản đồ code](../code-map.md) hoặc [mục lục](../README.md).", ""]
    grouped: dict[str, list[Path]] = defaultdict(list)
    for path in paths:
        grouped[path.parent.relative_to(ROOT).as_posix()].append(path)
    for group, files in grouped.items():
        lines += [f"## {group}", "", "| File | Vai trò | Khai báo |", "| --- | --- | --- |"]
        for path in files:
            if path.suffix == ".py":
                symbols = py_symbols(path)
            elif path.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}:
                symbols = ts_symbols(path)
            else:
                symbols = []
            names = ", ".join(source_link(path, f"`{name}`", line) for name, line in symbols[:8])
            if len(symbols) > 8:
                names += f"; +{len(symbols) - 8} khai báo"
            lines.append(f"| {source_link(path)} | {role_of(path)} | {names or '—'} |")
        lines.append("")
    return "\n".join(lines) + "\n"


def constant_string(node: ast.AST | None) -> str | None:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def route_rows(path: Path, router: str, prefix: str) -> list[tuple[str, str, Path, str, int]]:
    tree = ast.parse(text_of(path))
    own_prefix = ""
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == router for target in node.targets):
            if isinstance(node.value, ast.Call):
                for keyword in node.value.keywords:
                    if keyword.arg == "prefix":
                        own_prefix = constant_string(keyword.value)
                        if own_prefix is None:
                            raise ValueError(f"Dynamic router prefix requires manual review: {path}")
    rows = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute):
                continue
            call = decorator.func
            if not isinstance(call.value, ast.Name) or call.value.id != router or call.attr not in HTTP_METHODS:
                continue
            route = constant_string(decorator.args[0]) if decorator.args else None
            if route is None:
                route = next((constant_string(keyword.value) for keyword in decorator.keywords if keyword.arg == "path"), None)
            if route is None:
                raise ValueError(f"Dynamic route requires manual review: {path}:{node.lineno}")
            rows.append((call.attr.upper(), prefix + own_prefix + route, path, node.name, node.lineno))
    return rows


def api_index() -> str:
    main = ROOT / "backend/app/main.py"
    tree = ast.parse(text_of(main))
    imports: dict[str, tuple[Path, str]] = {}
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app."):
            for name in node.names:
                imports[name.asname or name.name] = (ROOT / "backend" / (node.module.replace(".", "/") + ".py"), name.name)
    rows = []
    for node in tree.body:
        if not isinstance(node, ast.Expr) or not isinstance(node.value, ast.Call):
            continue
        call = node.value
        if not isinstance(call.func, ast.Attribute) or call.func.attr != "include_router" or not call.args:
            continue
        if not isinstance(call.func.value, ast.Name) or call.func.value.id != "app":
            continue
        name = call.args[0]
        if not isinstance(name, ast.Name) or name.id not in imports:
            raise ValueError("Router registration needs manual review")
        prefix = next((constant_string(kw.value) for kw in call.keywords if kw.arg == "prefix"), "")
        if prefix is None:
            raise ValueError("Dynamic registration prefix needs manual review")
        path, router = imports[name.id]
        rows.extend(route_rows(path, router, prefix))
    rows.extend(route_rows(main, "app", ""))
    lines = ["# HTTP và WebSocket route từ source", "",
             "Sinh bằng `python scripts/build_code_index.py`; không import ASGI app hay gọi API.", "",
             f"**{len(rows)} khai báo route**: decorator HTTP/WebSocket ở các router được `app/main.py` đăng ký trực tiếp, cộng route trực tiếp của app.",
             "Prefix được ghép từ khai báo `include_router` và `APIRouter`. Thứ tự giữ theo đăng ký trong main và khai báo trong module.",
             "Không bao gồm route tự sinh của thư viện (Swagger/OpenAPI/metrics), mount, include lồng hoặc route được tạo động.",
             "Bảng không mô tả quyền, schema, trạng thái triển khai hoặc thay thế OpenAPI thực tế; mở handler và dependency để kiểm tra.", "",
             "Quay lại [bản đồ code](../code-map.md) hoặc [mục lục](../README.md).", ""]
    current = None
    for method, route, path, name, line in rows:
        if path != current:
            current = path
            lines += [f"## {path.relative_to(ROOT).as_posix()}", "", "| Method | Path | Handler |", "| --- | --- | --- |"]
        lines.append(f"| {method} | `{route}` | {source_link(path, name, line)} |")
    return "\n".join(lines) + "\n"


def expected_indexes() -> dict[Path, str]:
    paths = source_paths()
    backend = [path for path in paths if (path.relative_to(ROOT).as_posix().startswith(BACKEND_ROOTS) and path.suffix == ".py") or path.relative_to(ROOT).as_posix() in BACKEND_CONFIG]
    frontend = [path for path in paths if (path.relative_to(ROOT).as_posix().startswith(FRONTEND_ROOTS) and path.suffix in FRONTEND_SUFFIXES) or path.relative_to(ROOT).as_posix() in FRONTEND_CONFIG]
    return {INDEX / "backend.md": file_index(backend, False),
            INDEX / "frontend.md": file_index(frontend, True),
            INDEX / "api.md": api_index()}


def check_links() -> list[str]:
    errors = []
    files = [ROOT / "README.md", ROOT / "AGENTS.md", *sorted(DOCS.rglob("*.md"))]
    for path in files:
        if not path.exists():
            errors.append(f"Missing document: {path.relative_to(ROOT)}")
            continue
        for match in re.finditer(r"(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)", text_of(path)):
            raw = match.group(1).strip().strip("<>")
            parts = urlsplit(raw)
            if parts.scheme or parts.netloc or not parts.path:
                continue
            target = (path.parent / unquote(parts.path)).resolve()
            if not target.is_relative_to(ROOT):
                errors.append(f"Link outside repository: {path.relative_to(ROOT)} -> {raw}")
            elif not target.exists():
                errors.append(f"Broken link: {path.relative_to(ROOT)} -> {raw}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check generated indexes and new-document links without writing")
    args = parser.parse_args()
    try:
        outputs = expected_indexes()
        errors = []
        for path, expected in outputs.items():
            if args.check:
                if not path.exists() or text_of(path) != expected:
                    errors.append(f"Index out of date: {path.relative_to(ROOT)}")
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(expected, encoding="utf-8", newline="\n")
                print(f"Generated {path.relative_to(ROOT)}")
        errors.extend(check_links())
        if errors:
            for error in errors:
                print(error, file=sys.stderr)
            return 1
        print("OK: source indexes match; all local links in new docs resolve.")
        return 0
    except (SyntaxError, UnicodeError, ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Index generation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
