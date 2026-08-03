import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Union
from logging.handlers import TimedRotatingFileHandler

LogDir = Union[str, Path]

def setup_logger(
    name: str = "wms",
    log_level: str = "INFO",
    service_name: Optional[str] = None,
    log_dir: LogDir = "logs",
) -> logging.Logger:
    # Tạo folder log (hỗ trợ nested: logs/auth, logs/api/...)
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(name)

    if not logger.handlers:
        logger.setLevel(getattr(logging, log_level.upper()))

        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )

        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        date_str = datetime.now().strftime("%Y%m%d")
        log_file_name = f"{service_name or name}_{date_str}.log"
        log_file = log_path / log_file_name

        file_handler = TimedRotatingFileHandler(
            log_file,
            when="D",
            interval=1,
            backupCount=30,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


def get_logger(name: str = "wms") -> logging.Logger:
  return logging.getLogger(name)