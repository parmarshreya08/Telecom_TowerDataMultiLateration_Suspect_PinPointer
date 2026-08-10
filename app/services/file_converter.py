"""
File format converter for E-Rakshak.
Converts XLSX, XLS, TSV files to CSV for pipeline processing.
"""

import os
import shutil
from pathlib import Path

import pandas as pd

from app.core.logging import logger


class FileConverter:
    """
    Converts tabular file formats to CSV for the ingestion pipeline.
    """

    SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".tsv"}

    @staticmethod
    def is_supported(filename: str) -> bool:
        """Check if a file extension is supported."""
        ext = Path(filename).suffix.lower()
        return ext in FileConverter.SUPPORTED_EXTENSIONS

    @staticmethod
    def get_extension(filename: str) -> str:
        """Get the lowercase extension of a file."""
        return Path(filename).suffix.lower()

    @staticmethod
    def convert_to_csv(input_path: str, output_path: str) -> str:
        """
        Convert a supported file to CSV format.
        Returns the path to the converted CSV file.
        If the input is already CSV, it's copied as-is.
        """
        ext = Path(input_path).suffix.lower()

        if ext == ".csv":
            shutil.copy(input_path, output_path)
            return output_path

        if ext in (".xlsx", ".xls"):
            df = pd.read_excel(input_path)
            df.to_csv(output_path, index=False)
            return output_path

        if ext == ".tsv":
            df = pd.read_csv(input_path, sep="\t")
            df.to_csv(output_path, index=False)
            return output_path

        raise ValueError(f"Unsupported file format: {ext}")

    @staticmethod
    def validate_and_convert(input_path: str, output_dir: str) -> tuple[str, str]:
        """
        Validate a file is supported and convert it to CSV.
        Returns (csv_path, original_extension).
        """
        ext = Path(input_path).suffix.lower()

        if ext not in FileConverter.SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file format '{ext}'. "
                f"Supported formats: {', '.join(FileConverter.SUPPORTED_EXTENSIONS)}"
            )

        filename = Path(input_path).stem
        output_path = os.path.join(output_dir, f"{filename}.csv")

        FileConverter.convert_to_csv(input_path, output_path)
        logger.info("file_converted", input=input_path, output=output_path, original_ext=ext)

        return output_path, ext
