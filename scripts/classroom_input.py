# SPDX-License-Identifier: AGPL-3.0-or-later
"""Give a float32 NHWC TFLite graph the classroom runtime's NCHW input.

Adds one standard TRANSPOSE at the graph entrance. Weights, predictions,
normalized output coordinates and the fixed YOLO-World vocabulary stay intact.
"""
import io
from pathlib import Path
import zipfile

import flatbuffers
import numpy as np
from ai_edge_litert import schema_py_generated as schema


def classroom_input(source, destination):
    data = Path(source).read_bytes()
    root = schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(data, 0))
    assert len(root.subgraphs) == 1, 'Expected one inference graph'
    assert all(not b.offset and not b.size for b in root.buffers), 'External buffers are unsupported'
    graph = root.subgraphs[0]
    assert len(graph.inputs) == 1 and len(graph.outputs) == 1
    old_index = int(graph.inputs[0])
    old = graph.tensors[old_index]
    assert old.type == schema.TensorType.FLOAT32
    shape = list(old.shape)
    if shape == [1, 3, 320, 320]:
        Path(destination).write_bytes(data)
        return Path(destination)
    assert shape == [1, 320, 320, 3], f'Unexpected input: {shape}'

    input_tensor = schema.TensorT()
    input_tensor.name = b'classroom_images_nchw'
    input_tensor.type = schema.TensorType.FLOAT32
    input_tensor.shape = [1, 3, 320, 320]
    input_tensor.hasRank = True
    new_index = len(graph.tensors)
    graph.tensors.append(input_tensor)

    buffer = schema.BufferT()
    buffer.data = np.frombuffer(np.array([0, 2, 3, 1], dtype='<i4').tobytes(), dtype=np.uint8)
    permutation = schema.TensorT()
    permutation.name = b'classroom_nchw_to_nhwc'
    permutation.type = schema.TensorType.INT32
    permutation.shape = [4]
    permutation.hasRank = True
    permutation.buffer = len(root.buffers)
    root.buffers.append(buffer)
    perm_index = len(graph.tensors)
    graph.tensors.append(permutation)

    code = schema.OperatorCodeT()
    code.builtinCode = schema.BuiltinOperator.TRANSPOSE
    code.deprecatedBuiltinCode = schema.BuiltinOperator.TRANSPOSE
    code.version = 1
    operator = schema.OperatorT()
    operator.opcodeIndex = len(root.operatorCodes)
    root.operatorCodes.append(code)
    operator.inputs = [new_index, perm_index]
    operator.outputs = [old_index]
    operator.builtinOptionsType = schema.BuiltinOptions.TransposeOptions
    operator.builtinOptions = schema.TransposeOptionsT()
    graph.operators.insert(0, operator)
    graph.inputs = [new_index]
    for signature in root.signatureDefs or []:
        if signature.subgraphIndex == 0:
            for item in signature.inputs:
                if item.tensorIndex == old_index:
                    item.tensorIndex = new_index

    builder = flatbuffers.Builder(len(data))
    builder.Finish(root.Pack(builder), file_identifier=b'TFL3')
    result = io.BytesIO(bytes(builder.Output()))
    # The classroom loader obtains the class names from this ZIP attachment.
    with zipfile.ZipFile(io.BytesIO(data)) as original, zipfile.ZipFile(result, 'a') as updated:
        for info in original.infolist():
            updated.writestr(info, original.read(info.filename))
    Path(destination).write_bytes(result.getvalue())
    return Path(destination)
