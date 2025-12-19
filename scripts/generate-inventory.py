#!/usr/bin/env python3
"""
Inventory generator for Askr framework
Generates inventories for src/, benches/, and tests/ directories
"""

import os
import re
import json
from pathlib import Path
from typing import Dict, List, Any


def extract_typescript_symbols(content: str) -> Dict[str, List[str]]:
    """Extract functions, classes, interfaces, etc. from TypeScript content"""
    symbols = {
        'functions': [],
        'classes': [],
        'interfaces': [],
        'types': [],
        'constants': [],
        'exports': []
    }

    # Function declarations (including async, excluding arrow functions assigned to variables)
    func_pattern = r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\('
    symbols['functions'].extend(re.findall(func_pattern, content))

    # Class declarations
    class_pattern = r'(?:export\s+)?class\s+(\w+)'
    symbols['classes'].extend(re.findall(class_pattern, content))

    # Interface declarations
    interface_pattern = r'(?:export\s+)?interface\s+(\w+)'
    symbols['interfaces'].extend(re.findall(interface_pattern, content))

    # Type declarations
    type_pattern = r'(?:export\s+)?type\s+(\w+)\s*='
    symbols['types'].extend(re.findall(type_pattern, content))

    # Constant declarations (only exported or const declarations)
    const_pattern = r'(?:export\s+)?const\s+(\w+)\s*[:=]'
    const_matches = re.findall(const_pattern, content)
    # Filter out function assignments and other patterns
    for match in const_matches:
        # Skip if it's followed by = ( indicating function assignment
        if not re.search(rf'const\s+{re.escape(match)}\s*=\s*\(', content):
            symbols['constants'].append(match)

    # Export statements
    export_pattern = r'export\s+(?:const|function|class|interface|type)\s+(\w+)'
    symbols['exports'].extend(re.findall(export_pattern, content))

    # Remove duplicates and filter out common keywords
    keywords_to_filter = {'if', 'for', 'while', 'do', 'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw', 'return', 'break', 'continue', 'new', 'this', 'super', 'extends', 'implements', 'import', 'export', 'from', 'as', 'typeof', 'instanceof', 'in', 'of', 'let', 'var', 'const'}

    for key in symbols:
        symbols[key] = [s for s in set(symbols[key]) if s not in keywords_to_filter and len(s) > 1]

    return symbols


def extract_benchmark_names(content: str) -> List[str]:
    """Extract benchmark names from benchmark files"""
    benchmarks = []

    # Vitest bench() calls
    bench_pattern = r'bench\(\s*[\'"]([^\'"]+)[\'"]'
    benchmarks.extend(re.findall(bench_pattern, content))

    # describe() blocks for benchmark suites
    describe_pattern = r'describe\(\s*[\'"]([^\'"]+)[\'"]'
    benchmarks.extend(re.findall(describe_pattern, content))

    return list(set(benchmarks))


def extract_test_behaviors(content: str) -> List[str]:
    """Extract test behaviors from test files"""
    behaviors = []

    # it() and test() calls
    test_pattern = r'(?:it|test)\(\s*[\'"]([^\'"]+)[\'"]'
    behaviors.extend(re.findall(test_pattern, content))

    return behaviors


def generate_src_inventory(src_dir: Path) -> Dict[str, Any]:
    """Generate inventory for src/ directory"""
    inventory = {}

    patterns = ['*.ts', '*.tsx']
    for pattern in patterns:
        for file_path in src_dir.rglob(pattern):
            if file_path.is_file():
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    relative_path = file_path.relative_to(src_dir.parent)
                    symbols = extract_typescript_symbols(content)

                    inventory[str(relative_path)] = {
                        'symbols': symbols,
                        'line_count': len(content.splitlines()),
                        'size': len(content)
                    }
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

    return inventory


def generate_benches_inventory(benches_dir: Path) -> Dict[str, Any]:
    """Generate inventory for benches/ directory"""
    inventory = {}

    for file_path in benches_dir.rglob('*.ts'):
        if file_path.is_file():
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                relative_path = file_path.relative_to(benches_dir.parent)
                benchmarks = extract_benchmark_names(content)

                inventory[str(relative_path)] = {
                    'benchmarks': benchmarks,
                    'line_count': len(content.splitlines()),
                    'size': len(content)
                }
            except Exception as e:
                print(f"Error processing {file_path}: {e}")

    return inventory


def generate_tests_inventory(tests_dir: Path) -> Dict[str, Any]:
    """Generate inventory for tests/ directory"""
    inventory = {}

    patterns = ['*.ts', '*.tsx']
    for pattern in patterns:
        for file_path in tests_dir.rglob(pattern):
            if file_path.is_file():
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    relative_path = file_path.relative_to(tests_dir.parent)
                    behaviors = extract_test_behaviors(content)

                    inventory[str(relative_path)] = {
                        'behaviors': behaviors,
                        'line_count': len(content.splitlines()),
                        'size': len(content)
                    }
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

    return inventory


def generate_markdown_inventory(src_inventory: Dict, benches_inventory: Dict, tests_inventory: Dict) -> str:
    """Generate markdown formatted inventory"""
    lines = []

    # Header
    lines.append("# Askr Framework Inventory")
    lines.append("")
    lines.append("Generated on: 2025-12-17")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Source files**: {len(src_inventory)}")
    lines.append(f"- **Benchmark files**: {len(benches_inventory)}")
    lines.append(f"- **Test files**: {len(tests_inventory)}")

    total_src_symbols = sum(len(file_data['symbols']['functions']) +
                           len(file_data['symbols']['classes']) +
                           len(file_data['symbols']['interfaces'])
                           for file_data in src_inventory.values())
    lines.append(f"- **Total symbols in src/**: {total_src_symbols}")

    total_benchmarks = sum(len(file_data['benchmarks']) for file_data in benches_inventory.values())
    lines.append(f"- **Total benchmarks**: {total_benchmarks}")

    total_behaviors = sum(len(file_data['behaviors']) for file_data in tests_inventory.values())
    lines.append(f"- **Total test behaviors**: {total_behaviors}")
    lines.append("")

    # Source Files
    lines.append("## Source Files (`src/`)")
    lines.append("")

    for file_path in sorted(src_inventory.keys()):
        data = src_inventory[file_path]
        symbols = data['symbols']

        # Count symbols
        symbol_counts = []
        if symbols['classes']:
            symbol_counts.append(f"{len(symbols['classes'])} classes")
        if symbols['interfaces']:
            symbol_counts.append(f"{len(symbols['interfaces'])} interfaces")
        if symbols['functions']:
            symbol_counts.append(f"{len(symbols['functions'])} functions")
        if symbols['types']:
            symbol_counts.append(f"{len(symbols['types'])} types")
        if symbols['constants']:
            symbol_counts.append(f"{len(symbols['constants'])} constants")

        symbol_summary = ", ".join(symbol_counts) if symbol_counts else "No symbols"
        lines.append(f"- `{file_path}` - {symbol_summary}")

    lines.append("")

    # Benchmark Files
    lines.append("## Benchmark Files (`benches/`)")
    lines.append("")

    for file_path in sorted(benches_inventory.keys()):
        data = benches_inventory[file_path]
        lines.append(f"- `{file_path}` - {len(data['benchmarks'])} benchmarks")
        if data['benchmarks']:
            for benchmark in sorted(data['benchmarks']):
                lines.append(f"  - {benchmark}")
        lines.append("")

    # Test Files
    lines.append("## Test Files (`tests/`)")
    lines.append("")

    for file_path in sorted(tests_inventory.keys()):
        data = tests_inventory[file_path]
        lines.append(f"- `{file_path}` - {len(data['behaviors'])} test behaviors")
        if data['behaviors']:
            for behavior in sorted(data['behaviors']):
                lines.append(f"  - {behavior}")
        lines.append("")
    return "\n".join(lines)

def main():
    """Main entry point"""
    repo_root = Path(__file__).parent.parent

    print("Generating Askr inventory...")

    # Generate inventories
    src_inventory = generate_src_inventory(repo_root / 'src')
    benches_inventory = generate_benches_inventory(repo_root / 'benches')
    tests_inventory = generate_tests_inventory(repo_root / 'tests')

    # Generate markdown
    markdown_content = generate_markdown_inventory(src_inventory, benches_inventory, tests_inventory)

    # Write to markdown file
    output_file = repo_root / 'inventory.md'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(markdown_content)

    print(f"Inventory generated: {output_file}")

    # Print summary
    print("\nSummary:")
    print(f"  Source files: {len(src_inventory)}")
    print(f"  Benchmark files: {len(benches_inventory)}")
    print(f"  Test files: {len(tests_inventory)}")

    total_src_symbols = sum(len(file_data['symbols']['functions']) +
                           len(file_data['symbols']['classes']) +
                           len(file_data['symbols']['interfaces'])
                           for file_data in src_inventory.values())
    print(f"  Total symbols in src/: {total_src_symbols}")

    total_benchmarks = sum(len(file_data['benchmarks']) for file_data in benches_inventory.values())
    print(f"  Total benchmarks: {total_benchmarks}")

    total_behaviors = sum(len(file_data['behaviors']) for file_data in tests_inventory.values())
    print(f"  Total test behaviors: {total_behaviors}")


if __name__ == '__main__':
    main()
