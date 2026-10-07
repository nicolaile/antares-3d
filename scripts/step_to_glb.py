"""STEP -> raw GLB with native OpenCascade (no WASM memory ceiling).

    python step_to_glb.py in.stp out.glb [deflection_ratio] [--parts]

Keeps the assembly tree, instancing, part names and colours. Output is
metres, Z-up, as authored in NX.

--parts splits every body into its own glTF node named p00001, p00002, …
(repeat placements of a shared sub-assembly get -2, -3, … from
gltf-unique-parts.mjs) for the tagging tool (/cad/tag). Mark-0 arrives as one flattened part of
~10k bodies, so without this there is nothing to tag. The numbering is
the reader's traversal order, which depends only on the STEP file, not on
the deflection: tags made on a coarse conversion apply to a fine one.
"""
import sys
import time

from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.IFSelect import IFSelect_RetDone
from OCP.Message import Message_ProgressRange
from OCP.RWGltf import RWGltf_CafWriter
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence, TDF_Tool
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_COMPOUND, TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS_Iterator
from OCP.XCAFApp import XCAFApp_Application
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_Editor

args = [a for a in sys.argv[1:] if not a.startswith("--")]
parts = "--parts" in sys.argv
src, out = args[0], args[1]
ratio = float(args[2]) if len(args) > 2 else 0.0004
t0 = time.time()


def log(*a):
    print(f"[{time.time() - t0:6.1f}s]", *a, flush=True)


app = XCAFApp_Application.GetApplication_s()
doc = TDocStd_Document(TCollection_ExtendedString("MDTV-XCAF"))
app.InitDocument(doc)

reader = STEPCAFControl_Reader()
reader.SetColorMode(True)
reader.SetNameMode(True)
reader.SetLayerMode(False)
reader.SetGDTMode(False)
log("reading", src)
if reader.ReadFile(src) != IFSelect_RetDone:
    sys.exit("could not read STEP file")
log("transferring")
reader.Transfer(doc)

shapes = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
roots = TDF_LabelSequence()
shapes.GetFreeShapes(roots)

if parts:

    def has(shape, kind):
        return TopExp_Explorer(shape, kind).More()

    def bodies(shape):
        """Direct children of a compound that carry surfaces."""
        n = 0
        it = TopoDS_Iterator(shape)
        while it.More():
            n += has(it.Value(), TopAbs_FACE)
            it.Next()
        return n

    def components(label):
        comps = TDF_LabelSequence()
        shapes.GetComponents_s(label, comps, False)
        for i in range(1, comps.Length() + 1):
            ref = TDF_Label()
            shapes.GetReferredShape_s(comps.Value(i), ref)
            yield comps.Value(i), ref

    # Expand every multi-body compound into an assembly, one component per
    # body, keeping the per-body colours. NX nests them inside assemblies,
    # where Expand on the root alone never reaches.
    def split(label):
        if shapes.IsAssembly_s(label):
            for _, ref in components(label):
                split(ref)
            return
        shape = shapes.GetShape_s(label)
        if shape.ShapeType() == TopAbs_COMPOUND and bodies(shape) > 1:
            XCAFDoc_Editor.Expand_s(doc.Main(), label, True)

    count = 0
    named = set()

    def entry(label):
        e = TCollection_AsciiString()
        TDF_Tool.Entry_s(label, e)
        return e.ToCString()

    def name_leaves(label):
        global count
        for comp, ref in components(label):
            if shapes.IsAssembly_s(ref):
                name_leaves(ref)
            # Leaves without surfaces (NX's wireframe curves) never render: no id.
            # A sub-assembly placed several times shares its component labels,
            # so each is named once; gltf-unique-parts.mjs then suffixes the
            # repeats per placement (p00010, p00010-2, …).
            elif entry(comp) not in named and has(shapes.GetShape_s(ref), TopAbs_FACE):
                named.add(entry(comp))
                count += 1
                # Instance names win over product names in the glTF writer.
                TDataStd_Name.Set_s(comp, TCollection_ExtendedString(f"p{count:05d}"))

    for i in range(1, roots.Length() + 1):
        split(roots.Value(i))
    roots = TDF_LabelSequence()
    shapes.GetFreeShapes(roots)
    for i in range(1, roots.Length() + 1):
        name_leaves(roots.Value(i))
    log(f"split into {count} parts")

box = Bnd_Box()
for i in range(1, roots.Length() + 1):
    BRepBndLib.Add_s(shapes.GetShape_s(roots.Value(i)), box)
xmin, ymin, zmin, xmax, ymax, zmax = box.Get()
diag = ((xmax - xmin) ** 2 + (ymax - ymin) ** 2 + (zmax - zmin) ** 2) ** 0.5
deflection = diag * ratio
log(f"bounds {xmax - xmin:.0f} x {ymax - ymin:.0f} x {zmax - zmin:.0f} mm, deflection {deflection:.2f} mm")

# Meshing the roots meshes every shared part once; instances reuse it.
for i in range(1, roots.Length() + 1):
    BRepMesh_IncrementalMesh(shapes.GetShape_s(roots.Value(i)), deflection, False, 0.4, True)
log("meshed")

writer = RWGltf_CafWriter(TCollection_AsciiString(out), True)
# The coordinate converter is not bound in OCP: OCCT still writes metres,
# but leaves NX's Z-up, which gltf-zup-to-yup.mjs rotates to glTF's Y-up.
writer.SetMergeFaces(True)  # one primitive per part and colour, not per B-rep face
writer.SetParallel(True)
if not writer.Perform(doc, TColStd_IndexedDataMapOfStringString(), Message_ProgressRange()):
    sys.exit("glTF write failed")
log("wrote", out)
