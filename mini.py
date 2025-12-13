from nicegui import ui

def hide():
    print('sdgs')
    newcard = ui.card().tight() 
    with newcard:
        #ui.image('https://picsum.photos/id/237/536/354')

        with ui.card_section():
            ui.label('New Casrd')
    card.set_visibility(False)


card = ui.card().tight() 
with card:
    ui.image('https://picsum.photos/id/684/640/360')

    with ui.card_section():
        ui.label('Lorem ipsum dolor sit amet, consectetur adipiscing elit, ...')

card.on('click', hide)




ui.run()
