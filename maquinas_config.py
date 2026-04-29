# Mapeamento InventoryNumber → Nome da Máquina
# Edite à vontade: { 'numero': 'nome_exibido' }
MAQUINAS = {
    '6810': 'CM09 - OP10',
    # Adicione mais linhas aqui seguindo o mesmo padrão
}


def nome_maquina(inventory_number: str) -> str:
    return MAQUINAS.get(str(inventory_number), f'Máquina {inventory_number}')
