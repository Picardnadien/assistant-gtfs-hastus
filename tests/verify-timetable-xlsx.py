"""Independent read-only verification of the XLSX produced by browser export code."""
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET
from datetime import timedelta
import openpyxl

root = Path(__file__).resolve().parent.parent / 'tmp'
for language in ('fr', 'en', 'wide'):
    path = root / f'report-editor-timetables-{language}.xlsx'
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        for name in archive.namelist():
            ET.fromstring(archive.read(name))
    workbook = openpyxl.load_workbook(path)
    assert len(workbook.worksheets) == (1 if language == 'wide' else 3)
    sheet = workbook.worksheets[0]
    assert sheet.freeze_panes == 'C6'
    assert sheet['A5'].value == 'Headway (min)'
    assert sheet['A6'].value is None
    assert sheet['C6'].number_format == '[h]:mm:ss'
    assert sheet['C5'].fill.fgColor.rgb == 'FF557630'
    assert sheet.page_setup.orientation == 'landscape'
    if language == 'wide':
        assert sheet['B6'].value == '=NOT_A_FORMULA()'
        assert sheet['B6'].data_type == 's'
        assert sheet['C6'].value == timedelta(hours=25)
        assert sheet.max_column == 16
    else:
        assert sheet['A7'].value == 30
        assert sheet['C6'].value == timedelta(hours=10)
        assert 'CLEAN' in sheet['C5'].value
        assert workbook.worksheets[1]['A6'].value is None
    workbook.close()
print('PASS: XLSX ZIP/XML, independent workbook loading, typed times >24h, headways, styles, freeze panes, formula-like IDs preserved as text.')
