import os

def generate_context_dump(root_dir, output_file):
    ignore_dirs = {
        'node_modules', '.git', '__pycache__', '.pytest_cache', 
        '.venv', 'venv', 'env', 'dist', 'build', '.next', 'scratch'
    }
    
    ignore_exts = {
        '.pyc', '.pyo', '.pyd', '.so', '.dll', '.exe', 
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', 
        '.pdf', '.zip', '.tar', '.gz', '.db', '.sqlite3',
        '.csv', '.xlsx', '.xls', '.tsv'
    }

    with open(output_file, 'w', encoding='utf-8') as outfile:
        outfile.write("=================================================================\n")
        outfile.write(" E-RAKSHAK PROJECT CONTEXT DUMP\n")
        outfile.write("=================================================================\n\n")

        # 1. Directory Structure
        outfile.write("--- DIRECTORY STRUCTURE ---\n")
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            level = root.replace(root_dir, '').count(os.sep)
            indent = ' ' * 4 * level
            outfile.write(f"{indent}{os.path.basename(root)}/\n")
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                if not any(f.endswith(ext) for ext in ignore_exts):
                    outfile.write(f"{subindent}{f}\n")
        
        outfile.write("\n\n")

        # 2. File Contents
        outfile.write("--- FILE CONTENTS ---\n")
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for file in files:
                if any(file.endswith(ext) for ext in ignore_exts):
                    continue
                
                # Skip package-lock, yarn.lock, etc to save space
                if file in ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']:
                    continue
                
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, root_dir)
                
                # Try to read the file
                try:
                    with open(file_path, 'r', encoding='utf-8') as infile:
                        content = infile.read()
                        
                        outfile.write(f"\n{'='*80}\n")
                        outfile.write(f"FILE: {rel_path}\n")
                        outfile.write(f"{'='*80}\n")
                        outfile.write(content)
                        outfile.write("\n")
                except Exception as e:
                    outfile.write(f"\n[Could not read {rel_path}: {e}]\n")

if __name__ == "__main__":
    root_directory = r"D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer"
    output_path = os.path.join(root_directory, "project_context.txt")
    print(f"Generating context dump to {output_path}...")
    generate_context_dump(root_directory, output_path)
    print("Done!")
